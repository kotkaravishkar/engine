/* eslint-disable dot-location */
/** Copyright (c) 2022, Poozle, all rights reserved. **/

import { Injectable, NotFoundException } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLError } from 'graphql';
import { PrismaService } from 'nestjs-prisma';

import { EVENT_TYPES } from 'common/constants';
import { exclude } from 'common/utils';

import { AnalyticsService } from 'modules/analytics/analytics.service';
import { ControllerService } from 'modules/controller/controller.service';
import { ExtensionDefinitionRequestIdBody } from 'modules/extension_definition/extension_definition.interface';
import { ExtensionDefinitionService } from 'modules/extension_definition/extension_definition.service';

import {
  ExtensionAccountByEDGetRequestBody,
  ExtensionAccountCreateBody,
  ExtensionAccountGetRequestBody,
  ExtensionAccountMasked,
  ExtensionAccountRequestIdBody,
  ExtensionAccountUpdateBody,
} from './extension_account.interface';

@Injectable()
export class ExtensionAccountService {
  private readonly logger = new Logger(ExtensionAccountService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly analyticsService: AnalyticsService,
    private extensionDefinitionService: ExtensionDefinitionService,
    private controllerService: ControllerService,
  ) {}

  async getAllExtensionAccountsInWorkspace(
    extensionAccountGetRequestBody: ExtensionAccountGetRequestBody,
  ): Promise<ExtensionAccountMasked[]> {
    const accounts = await this.prisma.extensionAccount.findMany({
      where: {
        workspaceId: extensionAccountGetRequestBody.workspaceId,
      },
      include: {
        extensionDefinition: true,
      },
    });

    return accounts.map((account) =>
      exclude(account, ['extensionConfiguration']),
    );
  }

  async getAllExtensionAccountsForExtensionDefinition(
    extensionAccountByEDGetRequestBody: ExtensionAccountByEDGetRequestBody,
  ): Promise<ExtensionAccountMasked[]> {
    const accounts = await this.prisma.extensionAccount.findMany({
      where: {
        workspaceId: extensionAccountByEDGetRequestBody.workspaceId,
        extensionDefinitionId:
          extensionAccountByEDGetRequestBody.extensionDefinitionId,
      },
      include: {
        extensionDefinition: true,
      },
    });

    return accounts.map((account) =>
      exclude(account, ['extensionConfiguration']),
    );
  }

  async getExtensionAccountWithId(
    extensionAccountRequestIdBody: ExtensionAccountRequestIdBody,
  ): Promise<ExtensionAccountMasked> {
    const account = await this.prisma.extensionAccount.findUnique({
      where: {
        extensionAccountId: extensionAccountRequestIdBody.extensionAccountId,
      },
    });

    return exclude(account, ['extensionConfiguration']);
  }

  async checkIfExtensionAccountIsActive(
    extensionAccountRequestIdBody: ExtensionAccountRequestIdBody,
  ) {
    const { extensionAccountId } = extensionAccountRequestIdBody;

    const extensionAccount = await this.prisma.extensionAccount.findUnique({
      where: {
        extensionAccountId,
      },
      include: {
        workspace: true,
      },
    });

    if (!extensionAccount) {
      throw new NotFoundException('Extension account is not found');
    }
  }

  async checkForExtensionAccountName(
    workspaceId: string,
    extensionAccountName: string,
  ): Promise<boolean> {
    const accounts = await this.prisma.extensionAccount.findMany({
      where: {
        workspaceId,
        extensionAccountName,
      },
    });

    if (accounts.length === 0) {
      return true;
    }

    return false;
  }

  async createExtensionAccount(
    extensionAccountCreateBody: ExtensionAccountCreateBody,
  ): Promise<ExtensionAccountMasked> {
    try {
      const extensionDefinition =
        await this.extensionDefinitionService.getExtensionDefinitionWithId({
          extensionDefinitionId:
            extensionAccountCreateBody.extensionDefinitionId,
        } as ExtensionDefinitionRequestIdBody);

      const extensionAccount = await this.prisma.extensionAccount.create({
        data: {
          name: extensionDefinition.name,
          workspaceId: extensionAccountCreateBody.workspaceId,
          extensionAccountName: extensionAccountCreateBody.extensionAccountName,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extensionConfiguration:
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            extensionAccountCreateBody.extensionConfiguration as any,
          extensionDefinitionId:
            extensionAccountCreateBody.extensionDefinitionId,
        },
        include: {
          workspace: true,
          extensionDefinition: true,
        },
      });

      /**
       * When Extension router is not created
       * TODO (harshith) move to extension_router controller
       */
      const extensionRouter = await this.prisma.extensionRouter.findMany({
        where: {
          extensionDefinitionId: extensionAccount.extensionDefinitionId,
        },
      });

      if (extensionRouter.length === 0) {
        /**
         * Create extension router for the extension
         */

        this.logger.log(
          `Adding extension definition ${extensionDefinition.name} to router`,
        );

        const EXTENSION_BASE_HOST = this.configService.get(
          'EXTENSION_BASE_HOST',
        );

        await this.prisma.extensionRouter.create({
          data: {
            endpoint: `http://${extensionDefinition.name
              .toLowerCase()
              .replace(/ /g, '-')}${EXTENSION_BASE_HOST}/graphql`,
            extensionDefinitionId: extensionAccount.extensionDefinitionId,
            workspaceId: extensionAccount.workspaceId,
          },
        });
      }

      /**
       * Track
       */
      /** Track */
      this.analyticsService.track(
        extensionAccount.workspaceId,
        EVENT_TYPES.NEW_EXTENSION_ACCOUNT,
        {
          name: extensionAccount.name,
          extensionDockerImage:
            extensionAccount.extensionDefinition.dockerRepository,
          extensionDockerVersion:
            extensionAccount.extensionDefinition.dockerImageTag,
        },
      );

      /**
       * Create extension deployment
       */
      this.logger.log(
        `Created extension account ${extensionAccount.extensionAccountId} and restarting gateway ${extensionAccount.workspace.slug}`,
      );
      await this.controllerService.createExtensionDeployment(
        false,
        extensionDefinition,
        extensionAccount.workspace.slug,
      );

      // Restart the gateway
      await this.controllerService.restartGatewayDeployment(
        extensionAccount.workspace,
      );

      return exclude(extensionAccount, ['extensionConfiguration']);
    } catch (e) {
      console.log(e);
      throw new GraphQLError(e.message);
    }
  }

  async updateExtensionAccount(
    extensionAccountUpdateBody: ExtensionAccountUpdateBody,
  ): Promise<ExtensionAccountMasked> {
    const extensionAccount = await this.prisma.extensionAccount.findUnique({
      where: {
        extensionAccountId: extensionAccountUpdateBody.extensionAccountId,
      },
      include: {
        workspace: true,
      },
    });

    this.logger.log(
      `Updating extension account for ${extensionAccount.extensionAccountId}`,
    );

    const updatedExtensionAccount = await this.prisma.extensionAccount.update({
      data: {
        extensionAccountName: extensionAccountUpdateBody.extensionAccountName,
        extensionConfiguration:
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          extensionAccountUpdateBody.extensionConfiguration as any,
      },
      where: {
        extensionAccountId: extensionAccountUpdateBody.extensionAccountId,
      },
    });

    this.logger.log(`Updated extension account and restarting gateway`);
    // Restart the gateway
    await this.controllerService.restartGatewayDeployment(
      extensionAccount.workspace,
    );

    return exclude(updatedExtensionAccount, ['extensionConfiguration']);
  }

  /**
   * Create all the deployments and services when the server starts up
   */
  async initServer() {
    const extensionAccounts = await this.prisma.extensionAccount.findMany({
      distinct: ['extensionDefinitionId', 'workspaceId'],
      include: {
        workspace: true,
      },
    });

    const workspaces = extensionAccounts.map((account) => account.workspace);

    const extensionDefinitions = await Promise.all(
      extensionAccounts.map(
        async (account) =>
          await this.extensionDefinitionService.getExtensionDefinitionWithId({
            extensionDefinitionId: account.extensionDefinitionId,
            workspaceId: account.workspaceId,
          }),
      ),
    );

    /** Create extension deployments */
    await Promise.all(
      extensionDefinitions.map(async (extensionDefinition) => {
        this.logger.log(
          `Creating deployment for extension ${extensionDefinition.name}:${extensionDefinition.extensionDefinitionId}`,
        );
        try {
          await this.controllerService.createExtensionDeploymentSync(
            false,
            extensionDefinition,
            '',
          );
        } catch (e) {
          this.logger.error(
            `Creating failed for extension: ${extensionDefinition.extensionDefinitionId} with ${e}`,
          );
        }
      }),
    );

    /** Create gateway deployments */
    await Promise.all(
      workspaces.map(async (workspace) => {
        this.logger.log(
          `Creating deployment for workspace ${workspace.slug}:${workspace.workspaceId}`,
        );
        try {
          await this.controllerService.createGatewayDeployment(workspace);
        } catch (e) {
          this.logger.error(
            `Creating failed for workspace: ${workspace.workspaceId} with ${e}`,
          );
        }
      }),
    );
  }
}
