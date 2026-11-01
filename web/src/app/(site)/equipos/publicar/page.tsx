"use client";

import { useRouter } from "next/navigation";
import { ListingForm } from "@/components/classifieds/ListingForm";
import { SignInGate } from "@/components/classifieds/parts";

export default function PublishEquipmentPage() {
  const router = useRouter();
  return (
    <SignInGate back={{ href: "/equipos", label: "Equipos en venta" }} title="Vender mi equipo" why="Entra con tu cuenta de Kubbo3D (es gratis) para publicar tu equipo.">
      {(session) => <ListingForm userId={session.user.id} onDone={(id) => router.push(`/equipos/${id}`)} />}
    </SignInGate>
  );
}
