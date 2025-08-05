import { supabase } from '../lib/supabaseClient';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// Extracts the Notion Page ID from a URL.
function getPageIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/[a-f0-9]{32}/);
    return match ? match[0] : null;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ message: 'Method Not Allowed' });
    }

    // --- NEW: Get Page ID from Referer Header ---
    const referer = req.headers.referer;
    const pageId = getPageIdFromUrl(referer);

    if (!pageId) {
        return res.status(400).json({ message: 'Could not determine Notion Page ID from Referer header.' });
    }

    try {
        // 1. Fetch the page from Notion to get its properties.
        const notionPage = await notion.pages.retrieve({ page_id: pageId });

        // 2. Safely extract the duration from the "Duration" property.
        const durationProperty = notionPage.properties['Duration'];
        if (!durationProperty || durationProperty.type !== 'number' || durationProperty.number === null) {
            throw new Error('A "Duration" number property (in minutes) must be set on the Notion page.');
        }
        const durationInSeconds = durationProperty.number * 60;

        // 3. Check our database for an existing task record.
        const { data: task, error: dbError } = await supabase
            .from('tasks')
            .select('state, last_resumed_at, elapsed_sec, cover_url')
            .eq('notion_page_id', pageId)
            .maybeSingle();

        if (dbError) throw dbError;

        // Return the full state, including the pageId for the frontend to use in subsequent requests.
        const currentState = {
            pageId: pageId,
            duration_sec: durationInSeconds,
            state: task ? task.state : 'Not started',
            last_resumed_at: task ? task.last_resumed_at : null,
            elapsed_sec: task ? task.elapsed_sec : 0,
            cover_url: task ? task.cover_url : null,
        };

        return res.status(200).json(currentState);

    } catch (e) {
        console.error('Error in status endpoint:', e.message);
        return res.status(500).json({ message: `Server Error: ${e.message}` });
    }
}
