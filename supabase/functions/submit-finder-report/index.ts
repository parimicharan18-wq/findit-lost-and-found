import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

function normalizePhone(value: string): string | null {
  const raw = value.trim().replace(/[\s().-]/g, '');
  if (/^\+[1-9]\d{7,14}$/.test(raw)) return raw;
  if (/^[6-9]\d{9}$/.test(raw)) return `+91${raw}`;
  if (/^91[6-9]\d{9}$/.test(raw)) return `+${raw}`;
  return null;
}

function twilioAuth(accountSid: string, authToken: string): string {
  return `Basic ${btoa(`${accountSid}:${authToken}`)}`;
}

async function sendOwnerSms(to: string, itemName: string, location: string): Promise<'sent' | 'failed' | 'skipped'> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const messagingServiceSid = Deno.env.get('TWILIO_MESSAGING_SERVICE_SID');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  if (!accountSid || !authToken || (!messagingServiceSid && !fromNumber)) return 'skipped';
  const phone = normalizePhone(to);
  if (!phone) return 'failed';

  const form = new URLSearchParams({
    To: phone,
    Body: `FindIt alert: Someone found your item "${itemName}". Reported location: ${location}. Log in to FindIt to contact the finder and arrange a safe handover.`
  });
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid);
  else form.set('From', fromNumber!);

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: twilioAuth(accountSid, authToken), 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!response.ok) {
      console.error('FindIt SMS provider rejected notification', response.status, (await response.text()).slice(0, 300));
      return 'failed';
    }
    return 'sent';
  } catch (error) {
    console.error('FindIt SMS delivery error', error);
    return 'failed';
  }
}

async function callOwner(to: string, itemName: string, location: string): Promise<'sent' | 'failed' | 'skipped'> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  // Voice calls require a Twilio phone number; a Messaging Service SID is SMS-only.
  if (!accountSid || !authToken || !fromNumber) return 'skipped';
  const phone = normalizePhone(to);
  if (!phone) return 'failed';

  const spokenItem = itemName.replace(/[<>]/g, '').slice(0, 100);
  const spokenLocation = location.replace(/[<>]/g, '').slice(0, 160);
  const twiml = `<Response><Say voice="alice" language="en-US">FindIt alert. Someone has reported finding your registered item, ${spokenItem}. The reported location is ${spokenLocation}. Please open FindIt and contact the finder to arrange a safe handover. Thank you.</Say></Response>`;
  const form = new URLSearchParams({ To: phone, From: fromNumber, Twiml: twiml });

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`, {
      method: 'POST',
      headers: { authorization: twilioAuth(accountSid, authToken), 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    if (!response.ok) {
      console.error('FindIt voice provider rejected call', response.status, (await response.text()).slice(0, 300));
      return 'failed';
    }
    return 'sent'; // Twilio accepted the call request; this is not proof the owner answered.
  } catch (error) {
    console.error('FindIt voice call error', error);
    return 'failed';
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed.' }, { status: 405, headers: cors });
  const backend = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const body = await request.json();
    const token = String(body.token || '');
    const finder = { name:String(body.name||'').trim(), email:String(body.email||'').trim(), mobile:String(body.mobile||'').trim(), location:String(body.location||'').trim(), message:String(body.message||'').trim() };
    if (!/^[a-f0-9]{64}$/.test(token) || finder.name.length < 1 || finder.name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(finder.email) || finder.mobile.length < 7 || finder.mobile.length > 25 || finder.location.length < 1 || finder.location.length > 160 || finder.message.length < 1 || finder.message.length > 2000) return Response.json({ error:'Please check the finder form fields.' }, { status:400, headers:cors });
    const { data: found, error: lookupError } = await backend.rpc('findit_resolve_qr', { p_token:token });
    if (lookupError || !found?.length) return Response.json({ error:'This QR tag is invalid or inactive.' }, { status:404, headers:cors });
    const item = found[0];
    const { data: report, error } = await backend.from('findit_finder_reports').insert({ item_id:item.item_id, finder_name:finder.name, finder_email:finder.email, finder_mobile:finder.mobile, location:finder.location, message:finder.message }).select('id,created_at').single();
    if (error) throw error;

    const { data: owner } = await backend.from('findit_owner_items').select('owner_id').eq('id',item.item_id).single();
    const { data: profile } = owner ? await backend.from('findit_owner_profiles').select('full_name,mobile').eq('user_id',owner.owner_id).single() : { data:null };
    const { data: authUser } = owner ? await backend.auth.admin.getUserById(owner.owner_id) : { data:null };
    const ownerMobile = profile?.mobile || '';

    let emailStatus: 'sent' | 'failed' = 'failed';
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (apiKey && authUser?.user?.email) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method:'POST',
          headers:{ authorization:`Bearer ${apiKey}`, 'content-type':'application/json' },
          body:JSON.stringify({
            from:Deno.env.get('FINDIT_FROM_EMAIL') || 'FindIt <onboarding@resend.dev>',
            to:[authUser.user.email],
            subject:'FindIt Alert – Someone Found Your Lost Item!',
            text:`Hello ${profile?.full_name || 'FindIt owner'},\n\nGood news! Someone reported finding your registered item.\n\nItem Name: ${item.name}\nFinder Name: ${finder.name}\nFinder Contact: ${finder.email} / ${finder.mobile}\nFound Location: ${finder.location}\nFinder Message: ${finder.message}\n\nLogin to your FindIt dashboard to view and manage this report.\n\nThank you for using FindIt – Lost & Found Platform.`
          })
        });
        emailStatus = response.ok ? 'sent' : 'failed';
        if (!response.ok) console.error('FindIt email provider rejected notification', response.status, (await response.text()).slice(0, 300));
      } catch (sendError) {
        console.error('FindIt email delivery error', sendError);
        emailStatus = 'failed';
      }
    }

    const [smsStatus, callStatus] = ownerMobile
      ? await Promise.all([sendOwnerSms(ownerMobile, item.name, finder.location), callOwner(ownerMobile, item.name, finder.location)])
      : ['skipped', 'skipped'] as const;

    await backend.from('findit_finder_reports').update({ email_status:emailStatus, sms_status:smsStatus, call_status:callStatus }).eq('id',report.id);
    return Response.json({ ok:true, report_id:report.id, email_status:emailStatus, sms_status:smsStatus, call_status:callStatus }, { headers:cors });
  } catch (error) {
    console.error('finder report failed', error);
    return Response.json({ error:'Could not submit the report. Please try again.' }, { status:500, headers:cors });
  }
});
