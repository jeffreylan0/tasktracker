import { supabase } from '../lib/supabaseClient';
import { validateToken } from '../lib/auth';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  // Token is still required for all write operations.
  const { isValid, error: authError } = validateToken(req);
  if (!isValid) {
    return res.status(401).json({ message: authError });
  }

  const { pageId, duration_sec } = req.body;
  if (!pageId) {
    return res.status(400).json({ message: 'pageId is required in the request body.' });
  }

  try {
    const { data: currentTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('notion_page_id', pageId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    const now = new Date();
    let updatedTaskRecord;
    let notionStatusUpdate = null;

    if (!currentTask || currentTask.state === 'Not started') {
      const taskData = {
        notion_page_id: pageId,
        duration_sec: duration_sec,
        state: 'Working',
        last_resumed_at: now.toISOString(),
        elapsed_sec: 0,
      };
      notionStatusUpdate = 'Working';
      const { data, error } = await supabase.from('tasks').upsert(taskData).select().single();
      if(error) throw error;
      updatedTaskRecord = data;

    } else if (currentTask.state === 'Working') {
      const lastResumed = new Date(currentTask.last_resumed_at);
      const sessionDuration = Math.round((now.getTime() - lastResumed.getTime()) / 1000);
      const newElapsedSec = (currentTask.elapsed_sec || 0) + sessionDuration;
      const taskData = { state: 'Paused', last_resumed_at: null, elapsed_sec: newElapsedSec };
      const { data, error } = await supabase.from('tasks').update(taskData).eq('notion_page_id', pageId).select().single();
      if(error) throw error;
      updatedTaskRecord = data;

    } else if (currentTask.state === 'Paused') {
      const taskData = { state: 'Working', last_resumed_at: now.toISOString() };
      const { data, error } = await supabase.from('tasks').update(taskData).eq('notion_page_id', pageId).select().single();
      if(error) throw error;
      updatedTaskRecord = data;

    } else {
      return res.status(400).json({ message: 'Task is already completed.' });
    }

    if (notionStatusUpdate) {
      await notion.pages.update({
        page_id: pageId,
        properties: { 'Status': { select: { name: notionStatusUpdate } } },
      });
    }

    // Ensure the response includes all necessary fields for the frontend state.
    const finalResponse = {
        ...updatedTaskRecord,
        pageId: pageId,
        duration_sec: currentTask ? currentTask.duration_sec : duration_sec,
    };

    return res.status(200).json(finalResponse);

  } catch (e) {
    console.error('Error toggling task state:', e.message);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
