import { createFileRoute } from "@tanstack/react-router";
import { ShopOS } from "../components/os/shop-os";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return <ShopOS />;
}
