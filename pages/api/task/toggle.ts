import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../../lib/supabase';
import { inngest } from '../../../pages/api/inngest';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { taskId } = req.query;
  if (typeof taskId !== 'string') {
    return res.status(400).json({ error: 'Missing taskId' });
  }

  try {
    // Use a Postgres Function to handle the transaction safely
    const { data: result, error } = await supabase.rpc('toggle_task_state', {
      p_task_id: taskId,
    });

    if (error) throw error;

    // Enqueue jobs based on the new state returned from the DB function
    const { new_state, old_job_id } = result;

    if (new_state === 'running') {
      if (old_job_id === null) { // This means it was 'new' before
        await inngest.send({ name: 'app/images.generate', data: { taskId } });
      }
      const job = await inngest.send({ name: 'app/task.update', data: { taskId }, delay: { seconds: 30 } });
      await supabase.from('tasks').update({ update_job_id: job.id }).eq('id', taskId);
    } else if (new_state === 'paused' && old_job_id) {
      await inngest.cancel({ id: old_job_id });
    }

    res.status(200).json({ success: true, newState: new_state });
  } catch (error: any) {
    console.error('Error toggling task:', error);
    res.status(500).json({ error: error.message });
  }
}
