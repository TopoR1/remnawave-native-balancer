-- AlterTable
ALTER TABLE "host_balancers" ADD COLUMN "rebalance_existing_assignments_by_traffic" BOOLEAN NOT NULL DEFAULT false;
