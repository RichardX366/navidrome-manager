import express from 'express';
import attachMiddleware, { handleError } from 'rx-express-middleware';

export const app = express();
attachMiddleware(app);

import baseRouter from './routes';

app.use(baseRouter);

app.use(handleError({ prisma: true }));

app.listen(process.env.PORT || 3005, () =>
  console.log(
    `🚀 Server ready at: http://localhost:${process.env.PORT || 3005}`,
  ),
);
