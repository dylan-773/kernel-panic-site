import { createFileRoute, notFound } from "@tanstack/react-router";
import { DiveScreen } from "../components/game/dive";
import { DIVE_TYPES, DiveType } from "../game/types";

export const Route = createFileRoute("/dive/$type")({
  loader: ({ params }) => {
    if (!DIVE_TYPES.includes(params.type as DiveType)) throw notFound();
  },
  head: () => ({
    meta: [{ title: "Dive bay: Kernel Panic" }],
  }),
  component: DivePage,
});

function DivePage() {
  const { type } = Route.useParams();
  return <DiveScreen key={type} type={type as DiveType} />;
}
