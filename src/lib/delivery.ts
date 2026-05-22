type DeliveryPayload = {
  briefId: string;
  format: "html";
  title: string;
  html: string;
};

type FetchLike = typeof fetch;

export async function deliverBriefDigest(input: {
  endpoint: string;
  payload: DeliveryPayload;
  fetchImpl?: FetchLike;
}): Promise<number> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input.payload),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const message = responseText
      ? `Webhook delivery failed with status ${response.status}: ${responseText}`
      : `Webhook delivery failed with status ${response.status}`;

    throw new Error(message);
  }

  return response.status;
}
