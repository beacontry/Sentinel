"use client";

import { useEffect, useState } from "react";
import { createLatestRequest, type LatestRequest } from "@/lib/latest-request";

/**
 * One latest-request guard per component instance, cancelled on unmount
 * so a response landing after the page is gone writes nothing. See
 * src/lib/latest-request.ts for the contract.
 */
export function useLatestRequest(): LatestRequest {
  const [req] = useState(createLatestRequest);
  useEffect(() => () => req.cancel(), [req]);
  return req;
}
