// File: api/task/complete.js
import { supabase } from '../lib/supabaseClient';
import { validateToken } from '../lib/auth';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { isValid, error: authError } = validateToken(req);
  if (!isValid) {
    return res.status(401).json({ message: authError });
  }

  const { pageId } = req.body;
  if (!pageId) {
    return res.status(400).json({ message: 'pageId is required.' });
  }

  try {
    await supabase.from('tasks').update({ state: 'Completed', last_resumed_at: null }).eq('notion_page_id', pageId);

    await notion.pages.update({
      page_id: pageId,
      properties: { 'Status': { select: { name: 'Completed' } } },
      cover: null
    });

    return res.status(200).json({ message: 'Task marked as completed.' });

  } catch (e) {
    console.error('Error completing task:', e.message);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
