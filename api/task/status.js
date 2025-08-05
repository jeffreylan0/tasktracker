// File: api/task/status.js
// Description: [GET] Fetches task state, now reading duration from the Notion page property.

import { supabase } from '../lib/supabaseClient';
import { validateToken } from '../lib/auth';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { isValid, error } = validateToken(req);
  if (!isValid) {
    return res.status(401).json({ message: error });
  }

  const { pageId } = req.query;
  if (!pageId) {
    return res.status(400).json({ message: 'pageId is required.' });
  }

  try {
    // 1. Fetch the page from Notion to get its properties.
    const notionPage = await notion.pages.retrieve({ page_id: pageId });

    // 2. Extract the duration from the "Duration" property.
    const durationProperty = notionPage.properties['Duration'];
    if (!durationProperty || durationProperty.type !== 'number' || durationProperty.number === null) {
      throw new Error('A "Duration" number property must be set on the Notion page (and is assumed to be in minutes).');
    }
    const durationInMinutes = durationProperty.number;
    const durationInSeconds = durationInMinutes * 60;

    // 3. Check our own database for an existing task record.
    const { data: task, error: dbError } = await supabase
      .from('tasks')
      .select('state, last_resumed_at, elapsed_sec, cover_url')
      .eq('notion_page_id', pageId)
      .maybeSingle();

    if (dbError) throw dbError;

    if (task) {
      // Task exists; combine its state with the fresh duration from Notion.
      return res.status(200).json({
        ...task,
        duration_sec: durationInSeconds,
      });
    } else {
      // Task doesn't exist; return a default 'Not started' state with the duration from Notion.
      return res.status(200).json({
        duration_sec: durationInSeconds,
        state: 'Not started',
        last_resumed_at: null,
        elapsed_sec: 0,
        cover_url: null,
      });
    }
  } catch (e) {
    console.error('Error fetching task status:', e.message);
    return res.status(500).json({ message: `Server Error: ${e.message}` });
  }
}
