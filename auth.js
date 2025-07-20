// auth.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

  const supabase = createClient(
    'https://bjdscdfrtempliqdlaau.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqZHNjZGZydGVtcGxpcWRsYWF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDcyODkzODksImV4cCI6MjA2Mjg2NTM4OX0.bV7cH17hfK4MqY6N_QOcpao8DAVfqi37n5BSZTtXxDU'
  );

export async function isAuthenticated() {
  const { data } = await supabase.auth.getSession();
  return !!data?.session;
}

export async function isUserApproved(userId) {
  const { data, error } = await supabase.rpc('check_approval', { user_id: userId });
  if (error) {
    console.error('RPC check_approval error:', error);
    return false;
  }
  return data === true;
}


export async function logout() {
  await supabase.auth.signOut();
  sessionStorage.clear();
  localStorage.clear();
  window.location.href = 'index.html';
}

export async function getUserInfo() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}
