import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
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
    let emailStatus = 'failed';
    const { data: owner } = await backend.from('findit_owner_items').select('owner_id').eq('id',item.item_id).single();
    const { data: profile } = owner ? await backend.from('findit_owner_profiles').select('full_name').eq('user_id',owner.owner_id).single() : { data:null };
    const { data: authUser } = owner ? await backend.auth.admin.getUserById(owner.owner_id) : { data:null };
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (apiKey && authUser?.user?.email) {
      const response = await fetch('https://api.resend.com/emails', { method:'POST', headers:{ authorization:`Bearer ${apiKey}`, 'content-type':'application/json' }, body:JSON.stringify({ from:Deno.env.get('FINDIT_FROM_EMAIL') || 'FindIt <onboarding@resend.dev>', to:[authUser.user.email], subject:'FindIt Alert – Someone Found Your Lost Item!', text:`Hello ${profile?.full_name || 'FindIt owner'},\n\nGood news! Someone reported finding your registered item.\n\nItem Name: ${item.name}\nFinder Name: ${finder.name}\nFinder Contact: ${finder.email} / ${finder.mobile}\nFound Location: ${finder.location}\nFinder Message: ${finder.message}\n\nLogin to your FindIt dashboard to view and manage this report.\n\nThank you for using FindIt – Lost & Found Platform.` }) });
      emailStatus = response.ok ? 'sent' : 'failed';
    }
    await backend.from('findit_finder_reports').update({ email_status:emailStatus }).eq('id',report.id);
    return Response.json({ ok:true, report_id:report.id, email_status:emailStatus }, { headers:cors });
  } catch (error) {
    console.error('finder report failed', error);
    return Response.json({ error:'Could not submit the report. Please try again.' }, { status:500, headers:cors });
  }
});
