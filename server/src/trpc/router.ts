import { testDatabaseConnection } from '../lib/db';
import { publicProcedure, router } from './init';
import { inviteRouter } from './routers/invite';
import { mockApiRouter } from './routers/mockApi';
import { projectRouter } from './routers/project';
import { teamRouter } from './routers/team';
import { userRouter } from './routers/user';

export const appRouter = router({
  health: publicProcedure.query(async () => {
    const connectionHealthy = await testDatabaseConnection();
    return {
      ok: true as const,
      connectionHealthy,
      timestamp: new Date().toISOString(),
    };
  }),
  user: userRouter,
  team: teamRouter,
  invite: inviteRouter,
  project: projectRouter,
  mockApi: mockApiRouter,
});

export type AppRouter = typeof appRouter;
