FROM node:18-alpine as pre-yarn
WORKDIR /app
COPY package.json yarn.lock ./
COPY prisma ./prisma

FROM pre-yarn as pre-install
COPY .yarnrc.yml ./
COPY .yarn ./.yarn

FROM pre-install as prod-install
RUN yarn workspaces focus --production

FROM pre-install as build
RUN yarn --immutable
COPY . .
RUN yarn build

FROM pre-yarn as main
COPY --from=prod-install /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
CMD ["yarn", "start"]