"use client";
/** Finance (placeholder until the real app lands). */
import { Hub } from "../AppHost";

export function FinanceApp({ param }: { param?: string }) {
  return <Hub title="Finance" sections={[{ id: "a", title: "finance", content: <p>{param ?? ""}</p> }]} />;
}
