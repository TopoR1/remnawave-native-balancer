-- CreateEnum
CREATE TYPE "HostBalancerStrategy" AS ENUM ('LEAST_ASSIGNED', 'WEIGHTED', 'RANDOM', 'PRIORITY_FAILOVER', 'LEAST_TRAFFIC', 'WEIGHTED_LEAST_TRAFFIC');

-- CreateEnum
CREATE TYPE "HostBalancerUnavailablePolicy" AS ENUM ('HIDE_HOST', 'ORIGINAL_HOST', 'KEEP_LAST_IF_POSSIBLE');

-- CreateEnum
CREATE TYPE "HostBalancerTrafficMetric" AS ENUM ('CURRENT_PERIOD', 'LAST_24H', 'LAST_6H', 'LAST_1H');

-- CreateEnum
CREATE TYPE "HostBalancerTargetStatus" AS ENUM ('ACTIVE', 'DRAINING', 'DISABLED', 'DEAD');

-- CreateTable
CREATE TABLE "host_balancers" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_uuid" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "strategy" "HostBalancerStrategy" NOT NULL DEFAULT 'LEAST_ASSIGNED',
    "unavailable_policy" "HostBalancerUnavailablePolicy" NOT NULL DEFAULT 'HIDE_HOST',
    "sticky_enabled" BOOLEAN NOT NULL DEFAULT true,
    "traffic_metric" "HostBalancerTrafficMetric",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "host_balancers_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "host_balancer_targets" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "balancer_uuid" UUID NOT NULL,
    "node_uuid" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "HostBalancerTargetStatus" NOT NULL DEFAULT 'ACTIVE',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "max_assigned_users" INTEGER,
    "override_address" TEXT,
    "override_port" INTEGER,
    "override_sni" TEXT,
    "override_host" TEXT,
    "override_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "host_balancer_targets_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "host_balancer_assignments" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_uuid" UUID NOT NULL,
    "user_uuid" UUID NOT NULL,
    "target_uuid" UUID NOT NULL,
    "reason" TEXT,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "host_balancer_assignments_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "host_balancer_decisions" (
    "uuid" UUID NOT NULL DEFAULT gen_random_uuid(),
    "host_uuid" UUID NOT NULL,
    "user_uuid" UUID NOT NULL,
    "target_uuid" UUID,
    "strategy" "HostBalancerStrategy" NOT NULL,
    "reason" TEXT NOT NULL,
    "diagnostics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),

    CONSTRAINT "host_balancer_decisions_pkey" PRIMARY KEY ("uuid")
);

-- CreateIndex
CREATE UNIQUE INDEX "host_balancers_host_uuid_key" ON "host_balancers"("host_uuid");

-- CreateIndex
CREATE INDEX "host_balancer_targets_balancer_uuid_idx" ON "host_balancer_targets"("balancer_uuid");

-- CreateIndex
CREATE INDEX "host_balancer_targets_node_uuid_idx" ON "host_balancer_targets"("node_uuid");

-- CreateIndex
CREATE UNIQUE INDEX "host_balancer_assignments_host_uuid_user_uuid_key" ON "host_balancer_assignments"("host_uuid", "user_uuid");

-- CreateIndex
CREATE INDEX "host_balancer_assignments_target_uuid_idx" ON "host_balancer_assignments"("target_uuid");

-- CreateIndex
CREATE INDEX "host_balancer_decisions_host_uuid_created_at_idx" ON "host_balancer_decisions"("host_uuid", "created_at" DESC);

-- CreateIndex
CREATE INDEX "host_balancer_decisions_user_uuid_created_at_idx" ON "host_balancer_decisions"("user_uuid", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "host_balancers" ADD CONSTRAINT "host_balancers_host_uuid_fkey" FOREIGN KEY ("host_uuid") REFERENCES "hosts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_targets" ADD CONSTRAINT "host_balancer_targets_balancer_uuid_fkey" FOREIGN KEY ("balancer_uuid") REFERENCES "host_balancers"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_targets" ADD CONSTRAINT "host_balancer_targets_node_uuid_fkey" FOREIGN KEY ("node_uuid") REFERENCES "nodes"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_assignments" ADD CONSTRAINT "host_balancer_assignments_host_uuid_fkey" FOREIGN KEY ("host_uuid") REFERENCES "hosts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_assignments" ADD CONSTRAINT "host_balancer_assignments_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_assignments" ADD CONSTRAINT "host_balancer_assignments_target_uuid_fkey" FOREIGN KEY ("target_uuid") REFERENCES "host_balancer_targets"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_decisions" ADD CONSTRAINT "host_balancer_decisions_host_uuid_fkey" FOREIGN KEY ("host_uuid") REFERENCES "hosts"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_decisions" ADD CONSTRAINT "host_balancer_decisions_user_uuid_fkey" FOREIGN KEY ("user_uuid") REFERENCES "users"("uuid") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_balancer_decisions" ADD CONSTRAINT "host_balancer_decisions_target_uuid_fkey" FOREIGN KEY ("target_uuid") REFERENCES "host_balancer_targets"("uuid") ON DELETE SET NULL ON UPDATE CASCADE;
