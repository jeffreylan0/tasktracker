import { NextApiRequest, NextApiResponse } from 'next';
import { withApiKey } from '../../../lib/auth';
import { logger } from '../../../lib/logger';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  logger.info('Cron job endpoint called (currently disabled for initial deployment).');
  // Return a success response so the cron scheduler doesn't log an error.
  res.status(200).json({ success: true, message: 'Endpoint is live but inactive.' });
}

export default withApiKey(handler);
