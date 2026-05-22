import { serve } from "inngest/next";

import {
  briefDeliveryFunction,
  inngest,
  scheduledSyncFunction,
} from "@/lib/inngest";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [scheduledSyncFunction, briefDeliveryFunction],
});
