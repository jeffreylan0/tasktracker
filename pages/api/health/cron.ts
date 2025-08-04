import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';
import { inngest } from '../inngest';
import { logger } from '../../../lib/logger';
import { withApiKey } from '../../../lib/auth';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const log = logger.child({ functionName: 'sweeperCron' });
  log.info('Cron job started.');

  try {
    // 1. Find tasks that have been 'running' for more than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: stuckTasks, error } = await supabase
      .from('tasks')
      .select('id, update_job_id')
      .eq('state', 'running')
      .lt('start_ts', tenMinutesAgo);

    if (error) throw error;
    if (!stuckTasks || stuckTasks.length === 0) {
      log.info('No stuck tasks found. Exiting.');
      return res.status(200).json({ success: true, message: 'No stuck tasks found.' });
    }

    log.warn({ count: stuckTasks.length }, 'Found potentially stuck tasks.');
    let restartedCount = 0;

    for (const task of stuckTasks) {
      try {
        // 2. Check if the job still exists and is active in Inngest
        const job = await inngest.getJob(task.update_job_id);
        // If job exists and is pending/running, it's not stuck.
        // The getJob method might throw if not found, depending on the client.
        if (job && !job.completed_at && !job.cancelled_at) {
          continue;
        }
      } catch (e) {
        // Job not found, so it's definitely stuck.
      }

      // 3. Re-enqueue the update job for the stuck task
      log.warn({ taskId: task.id }, 'Task is stuck. Re-enqueuing update job.');
      const newJob = await inngest.send({ name: 'app/task.update', data: { taskId: task.id } });
      await supabase.from('tasks').update({ update_job_id: newJob.id }).eq('id', task.id);
      restartedCount++;
    }

    log.info({ restartedCount }, 'Cron job finished.');
    res.status(200).json({ success: true, restarted_tasks: restartedCount });
  } catch (error: any) {
    log.error({ err: error }, 'Cron job failed.');
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

export default withApiKey(handler);
