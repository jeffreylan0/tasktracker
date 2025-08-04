import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';
import { notion } from '../../../lib/notion';
import { withApiKey } from '../../../lib/auth';
import { logger } from '../../../lib/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    logger.warn({ method: req.method }, 'Method not allowed on /api/task/create');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { notionPageId } = req.query;

  if (typeof notionPageId !== 'string') {
    return res.status(400).json({ error: 'Query parameter "notionPageId" is required.' });
  }

  const log = logger.child({ notionPageId, functionName: 'createTask' });
  log.info('Task creation initiated.');

  try {
    // 1. Create the task in Supabase to get a unique task ID (UUID)
    const { data: task, error: createError } = await supabase
      .from('tasks')
      .insert({
        notion_page_id: notionPageId,
        duration_sec: 1800 // Default duration, assuming Notion AI autofills this later
      })
      .select()
      .single();

    if (createError) throw createError;

    const taskId = task.id;
    log.info({ taskId }, 'Successfully created task record in database.');

    // 2. Find the "Initialize Task" button block on the Notion page
    const { results: blocks } = await notion.blocks.children.list({ block_id: notionPageId });
    const initBlock = blocks.find(
      (block: any) =>
        block.type === 'callout' &&
        block.callout.rich_text[0]?.plain_text.includes('Initialize Task')
    );

    if (initBlock) {
      // 3. Update the block to become the "Toggle Timer" button with the correct link
      const toggleUrl = `${process.env.APP_BASE_URL}/api/task/toggle?taskId=${taskId}&apiKey=${process.env.API_SECRET_KEY}`;

      await notion.blocks.update({
        block_id: initBlock.id,
        callout: {
          icon: { type: 'emoji', emoji: '▶️' },
          rich_text: [
            {
              type: 'text',
              text: { content: 'Toggle Timer', link: { url: toggleUrl } },
            },
          ],
        },
      });
      log.info({ blockId: initBlock.id }, 'Successfully updated Notion block to toggle button.');
    } else {
      log.warn('Could not find the "Initialize Task" block on the Notion page.');
    }

    res.status(200).json({ success: true, taskId });
  } catch (error: any) {
    log.error({ err: error }, 'Failed to create task.');
    res.status(500).json({ error: error.message });
  }
}

// Wrap the handler with the API key authentication middleware
export default withApiKey(handler);
