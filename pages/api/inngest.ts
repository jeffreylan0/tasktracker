import { Inngest } from 'inngest';
import { supabase } from '../../lib/supabase';
import { notion } from '../../lib/notion';
import { logger } from '../../lib/logger';
import sharp from 'sharp';

// Initialize Inngest client
export const inngest = new Inngest({ name: 'Notion Progress Tracker' });

/**
 * Worker 1: Generate Progress Images
 * Triggered once when a task starts. It fetches a background, generates 21
 * progress images (0% to 100%), and uploads them to Supabase Storage.
 */
const generateImages = inngest.createFunction(
  { name: 'Generate Progress Images' },
  { event: 'app/images.generate' },
  async ({ event }) => {
    const { taskId } = event.data;
    const log = logger.child({ taskId, functionName: 'generateImages' });
    log.info('Starting image generation process.');

    try {
      const bgResponse = await fetch('https://picsum.photos/800/450');
      const bgBuffer = await bgResponse.arrayBuffer();
      log.info('Successfully fetched background image.');

      for (let i = 0; i <= 100; i += 5) {
        const svgCircle = `<svg width="800" height="450" viewBox="0 0 150 100">
          <circle cx="75" cy="50" r="35" stroke="rgba(255,255,255,0.3)" stroke-width="6" fill="none" />
          <circle cx="75" cy="50" r="35" stroke="#fff" stroke-width="6" fill="none"
                  stroke-dasharray="219.9" stroke-dashoffset="${219.9 * (1 - i / 100)}"
                  transform="rotate(-90 75 50)" stroke-linecap="round" />
          <text x="75" y="55" font-family="sans-serif" font-weight="bold" font-size="16" fill="white" text-anchor="middle">${i}%</text>
        </svg>`;

        const imageBuffer = await sharp(bgBuffer)
          .blur(5)
          .modulate({ brightness: 0.8 })
          .composite([{ input: Buffer.from(svgCircle), blend: 'over' }])
          .png()
          .toBuffer();

        await supabase.storage.from('covers').upload(`${taskId}/progress_${i}.png`, imageBuffer, {
          contentType: 'image/png',
          upsert: true,
        });
      }
      log.info('Successfully generated and uploaded all 21 images.');

      await supabase.from('tasks').update({ images_ready: true }).eq('id', taskId);
      return { message: `Generated images for task ${taskId}` };
    } catch (error: any) {
      log.error({ err: error }, 'Image generation failed.');
      throw error; // Re-throw to let Inngest handle retry/failure logic
    }
  }
);

/**
 * Worker 2: Update Task Progress
 * A recurring job that calculates progress, updates the Notion cover,
 * and reschedules itself until the task is complete.
 */
const updateTaskProgress = inngest.createFunction(
  { name: 'Update Task Progress' },
  { event: 'app/task.update' },
  async ({ event, step }) => {
    const { taskId } = event.data;
    const log = logger.child({ taskId, functionName: 'updateTaskProgress' });
    log.info('Starting progress update step.');

    try {
      const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).single();

      if (!task || task.state !== 'running') {
        log.warn({ currentState: task?.state }, 'Task is not in a running state. Stopping update loop.');
        return { message: 'Task not running. Stopping loop.' };
      }

      const elapsed = (Date.now() - new Date(task.start_ts).getTime()) / 1000 + task.elapsed_off;
      const pct = Math.min(1, elapsed / task.duration_sec);
      const stepPct = Math.round((pct * 100) / 5) * 5; // Round to nearest 5% increment

      if (pct >= 1) {
        await supabase.from('tasks').update({ state: 'completed' }).eq('id', taskId);
        log.info('Task marked as completed.');
        // Optionally update cover to a final "completed" image here
        return { message: 'Task completed!' };
      }

      // Update Notion cover with the pre-generated image
      const { data: url } = supabase.storage.from('covers').getPublicUrl(`${taskId}/progress_${stepPct}.png`);
      await notion.pages.update({
        page_id: task.notion_page_id,
        cover: { type: 'external', external: { url: url.publicUrl } },
      });
      log.info({ newProgress: stepPct }, 'Successfully updated Notion cover.');

      // Reschedule this function to run again
      const job = await step.delay({ seconds: 30 });
      await supabase.from('tasks').update({ update_job_id: job.id }).eq('id', taskId);
      log.info({ nextJobId: job.id }, 'Successfully rescheduled next update.');

      return { message: `Updated progress for ${taskId} to ${stepPct}%` };
    } catch (error: any) {
      log.error({ err: error }, 'Progress update step failed.');
      throw error;
    }
  }
);

// Export the Inngest handler with all defined functions
export default inngest.createHandler([generateImages, updateTaskProgress]);
