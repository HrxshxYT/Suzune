import { PrismaClient } from "@prisma/client";

let client;

export function createPrisma() {
  if (!client) {
    client = new PrismaClient();
  }
  return client;
}
