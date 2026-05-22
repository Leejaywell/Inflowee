This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Local verification

1. Reset the local database with `pnpm db:reset`
2. Seed verification data with `pnpm db:seed`
3. Start the app with `pnpm dev`
4. Open `/` and confirm the seeded space and task render
5. Open `/sources` and confirm the seeded RSS source renders
6. Open `/inbox` and confirm a brief appears
7. Open `/inbox/<briefId>/html` and confirm the HTML digest renders

## Brief Surface Verification

- Run `pnpm test`
- Run `pnpm lint`
- Run `pnpm build`
- Run `pnpm typecheck`
- Open `/inbox`
- Open `/inbox/<briefId>`
- Ask one question from a task or brief chat console
- Confirm citations render and provenance badges show `Stored context` or `Live context`

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
