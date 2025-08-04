import { Inngest } from 'inngest';

// This is a temporary, minimal setup to allow the project to build.
// It does not contain any real logic.
export const inngest = new Inngest({ id: 'temp-build-client' });

// An empty handler to satisfy the Inngest/Vercel integration.
export default inngest.createHandler([]);
