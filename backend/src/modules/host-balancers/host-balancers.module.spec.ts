import { TransactionHost } from '@nestjs-cls/transactional';
// @ts-nocheck
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { QueryBus } from '@nestjs/cqrs';

import { JwtDefaultGuard } from '@common/guards/jwt-guards/def-jwt-guard';
import { RawCacheService } from '@common/raw-cache';

import { HostBalancersModule } from './host-balancers.module';

@Global()
@Module({
    providers: [
        {
            provide: RawCacheService,
            useValue: {
                get: async () => null,
                set: async () => undefined,
            },
        },
        {
            provide: TransactionHost,
            useValue: {
                tx: {},
            },
        },
    ],
    exports: [RawCacheService, TransactionHost],
})
class HostBalancersStartupMocksModule {}

@Module({
    imports: [HostBalancersStartupMocksModule, HostBalancersModule],
})
class HostBalancersStartupTestModule {}

describe('HostBalancersModule startup wiring', () => {
    it('initializes Nest HTTP app with JwtDefaultGuard dependencies and resolves QueryBus', async () => {
        const app = await NestFactory.create(HostBalancersStartupTestModule, {
            logger: false,
        });

        try {
            await app.init();

            const hostBalancersContext = app.select(HostBalancersModule);
            const queryBus = hostBalancersContext.get(QueryBus);
            const guard = await hostBalancersContext.resolve(JwtDefaultGuard);

            assert.ok(queryBus);
            assert.ok(guard);
        } finally {
            await app.close();
        }
    });
});
