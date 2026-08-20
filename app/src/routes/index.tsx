import { createFileRoute } from "@tanstack/react-router";
import { GameShell } from "../components/scene/game-shell";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <GameShell />;
}
