// File: api/image/generate.js
import { supabase } from '../lib/supabaseClient';
import { validateToken } from '../lib/auth';
import sharp from 'sharp';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 450;

async function generateProgressImageBuffer(progress) {
  const randomImageUrl = `https://picsum.photos/${IMAGE_WIDTH}/${IMAGE_HEIGHT}?date=${Date.now()}`;
  const imageResponse = await fetch(randomImageUrl);
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  const circleRadius = 70;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * (circleRadius - strokeWidth / 2);
  const strokeDashoffset = circumference * (1 - Math.min(1, Math.max(0, progress)));

  const svgOverlay = `
    <svg width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" viewBox="0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}">
      <circle cx="${IMAGE_WIDTH / 2}" cy="${IMAGE_HEIGHT / 2}" r="${circleRadius - strokeWidth / 2}" fill="none" stroke="rgba(255, 255, 255, 0.2)" stroke-width="${strokeWidth}"/>
      <circle cx="${IMAGE_WIDTH / 2}" cy="${IMAGE_HEIGHT / 2}" r="${circleRadius - strokeWidth / 2}" fill="none" stroke="#ffffff" stroke-width="${strokeWidth}" stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round" transform="rotate(-90 ${IMAGE_WIDTH / 2} ${IMAGE_HEIGHT / 2})"/>
    </svg>`;

  return await sharp(imageBuffer)
    .blur(15)
    .composite([
      { input: Buffer.from(`<svg><rect x="0" y="0" width="${IMAGE_WIDTH}" height="${IMAGE_HEIGHT}" fill="#000000" opacity="0.5"/></svg>`) },
      { input: Buffer.from(svgOverlay) }
    ])
    .png()
    .toBuffer();
}

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
    const { data: task, error: fetchError } = await supabase.from('tasks').select('duration_sec, elapsed_sec').eq('notion_page_id', pageId).single();
    if (fetchError || !task) throw new Error('Task not found or failed to fetch.');

    const progress = task.duration_sec > 0 ? task.elapsed_sec / task.duration_sec : 0;
    const imageBuffer = await generateProgressImageBuffer(progress);

    const filePath = `public/${pageId}.png`;
    const { error: uploadError } = await supabase.storage.from('task_covers').upload(filePath, imageBuffer, { contentType: 'image/png', upsert: true });
    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage.from('task_covers').getPublicUrl(filePath);

    await supabase.from('tasks').update({ cover_url: publicUrl }).eq('notion_page_id', pageId);
    await notion.pages.update({ page_id: pageId, cover: { type: "external", external: { url: publicUrl } } });

    return res.status(200).json({ cover_url: publicUrl });

  } catch (e) {
    console.error('Error generating image:', e.message);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
}
