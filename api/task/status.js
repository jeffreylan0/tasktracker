// File: api/task/status.js
// Description: [GET] Fetches task state, with enhanced error handling for Notion properties.

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
    // --- NEW, MORE ROBUST LOGIC ---

    // 1. Fetch the page from Notion.
    let notionPage;
    try {
        notionPage = await notion.pages.retrieve({ page_id: pageId });
    } catch (e) {
        // This catch block handles errors like incorrect API keys or permissions.
        console.error("Notion API Error:", e.body);
        throw new Error(`Could not retrieve page from Notion. Check that your integration has access to the page and that the NOTION_API_KEY is correct. Original error: ${e.code}`);
    }

    // For debugging, let's log the properties object to the Vercel console.
    console.log("Notion Page Properties Received:", notionPage.properties);

    // 2. Safely extract the duration from the "Duration" property.
    const durationProperty = notionPage.properties['Duration'];

    if (!durationProperty) {
      throw new Error('Property "Duration" not found on the Notion page. Please check for typos or case-sensitivity.');
    }
    if (durationProperty.type !== 'number') {
      throw new Error(`Property "Duration" is not a 'Number' type. It is currently a '${durationProperty.type}' type. Please change it in Notion.`);
    }
    if (durationProperty.number === null || durationProperty.number === undefined) {
      throw new Error('The "Duration" property is empty. Please enter a number (in minutes).');
    }

    const durationInMinutes = durationProperty.number;
    const durationInSeconds = durationInMinutes * 60;

    // --- END OF NEW LOGIC ---

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
    // The new specific error messages from the try block will be sent here.
    console.error('Error in status endpoint:', e.message);
    return res.status(500).json({ message: `Server Error: ${e.message}` });
  }
}
