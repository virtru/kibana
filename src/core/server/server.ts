/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { Type } from '@kbn/config-schema';

import { ConfigService, Env, Config, ConfigPath } from './config';
import { ElasticsearchService } from './elasticsearch';
import { HttpService, InternalHttpServiceSetup } from './http';
import { LegacyService, ensureValidConfiguration } from './legacy';
import { Logger, LoggerFactory } from './logging';
import { UiSettingsService } from './ui_settings';
import { PluginsService, config as pluginsConfig } from './plugins';
import { SavedObjectsService } from '../server/saved_objects';

import { config as elasticsearchConfig } from './elasticsearch';
import { config as httpConfig } from './http';
import { config as loggingConfig } from './logging';
import { config as devConfig } from './dev';
import { config as kibanaConfig } from './kibana_config';
import { config as savedObjectsConfig } from './saved_objects';
import { config as uiSettingsConfig } from './ui_settings';
import { mapToObject } from '../utils/';
import { ContextService } from './context';
import { RequestHandlerContext } from '.';
import { InternalCoreSetup } from './internal_types';
import { CapabilitiesService } from './capabilities';

const coreId = Symbol('core');

export class Server {
  public readonly configService: ConfigService;
  private readonly capabilities: CapabilitiesService;
  private readonly context: ContextService;
  private readonly elasticsearch: ElasticsearchService;
  private readonly http: HttpService;
  private readonly legacy: LegacyService;
  private readonly log: Logger;
  private readonly plugins: PluginsService;
  private readonly savedObjects: SavedObjectsService;
  private readonly uiSettings: UiSettingsService;

  constructor(
    public readonly config$: Observable<Config>,
    public readonly env: Env,
    private readonly logger: LoggerFactory
  ) {
    this.log = this.logger.get('server');
    this.configService = new ConfigService(config$, env, logger);

    const core = { coreId, configService: this.configService, env, logger };
    this.context = new ContextService(core);
    this.http = new HttpService(core);
    this.plugins = new PluginsService(core);
    this.legacy = new LegacyService(core);
    this.elasticsearch = new ElasticsearchService(core);
    this.savedObjects = new SavedObjectsService(core);
    this.uiSettings = new UiSettingsService(core);
    this.capabilities = new CapabilitiesService(core);
  }

  public async setup() {
    this.log.debug('setting up server');

    // Discover any plugins before continuing. This allows other systems to utilize the plugin dependency graph.
    const pluginDependencies = await this.plugins.discover();
    const legacyPlugins = await this.legacy.discoverPlugins();

    // Immediately terminate in case of invalid configuration
    await ensureValidConfiguration(this.configService, legacyPlugins);

    const contextServiceSetup = this.context.setup({
      // We inject a fake "legacy plugin" with dependencies on every plugin so that legacy plugins:
      // 1) Can access context from any NP plugin
      // 2) Can register context providers that will only be available to other legacy plugins and will not leak into
      //    New Platform plugins.
      pluginDependencies: new Map([
        ...pluginDependencies,
        [this.legacy.legacyId, [...pluginDependencies.keys()]],
      ]),
    });

    const httpSetup = await this.http.setup({
      context: contextServiceSetup,
    });

    this.registerDefaultRoute(httpSetup);

    const capabilitiesSetup = this.capabilities.setup({ http: httpSetup });

    const elasticsearchServiceSetup = await this.elasticsearch.setup({
      http: httpSetup,
    });

    const uiSettingsSetup = await this.uiSettings.setup({
      http: httpSetup,
    });

    const savedObjectsSetup = await this.savedObjects.setup({
      elasticsearch: elasticsearchServiceSetup,
      legacyPlugins,
    });

    const coreSetup: InternalCoreSetup = {
      capabilities: capabilitiesSetup,
      context: contextServiceSetup,
      elasticsearch: elasticsearchServiceSetup,
      http: httpSetup,
      uiSettings: uiSettingsSetup,
      savedObjects: savedObjectsSetup,
    };

    const pluginsSetup = await this.plugins.setup(coreSetup);

    await this.legacy.setup({
      core: { ...coreSetup, plugins: pluginsSetup },
      plugins: mapToObject(pluginsSetup.contracts),
    });

    this.registerCoreContext(coreSetup);

    return coreSetup;
  }

  public async start() {
    this.log.debug('starting server');
    const savedObjectsStart = await this.savedObjects.start({});
    const capabilitiesStart = this.capabilities.start();
    const pluginsStart = await this.plugins.start({
      capabilities: capabilitiesStart,
      savedObjects: savedObjectsStart,
    });

    const coreStart = {
      capabilities: capabilitiesStart,
      savedObjects: savedObjectsStart,
      plugins: pluginsStart,
    };
    await this.legacy.start({
      core: coreStart,
      plugins: mapToObject(pluginsStart.contracts),
    });

    await this.http.start();

    return coreStart;
  }

  public async stop() {
    this.log.debug('stopping server');

    await this.legacy.stop();
    await this.plugins.stop();
    await this.savedObjects.stop();
    await this.elasticsearch.stop();
    await this.http.stop();
  }

  private registerDefaultRoute(httpSetup: InternalHttpServiceSetup) {
    const router = httpSetup.createRouter('/core');
    router.get({ path: '/', validate: false }, async (context, req, res) =>
      res.ok({ body: { version: '0.0.1' } })
    );
  }

  private registerCoreContext(coreSetup: InternalCoreSetup) {
    coreSetup.http.registerRouteHandlerContext(
      coreId,
      'core',
      async (context, req): Promise<RequestHandlerContext['core']> => {
        const adminClient = await coreSetup.elasticsearch.adminClient$.pipe(take(1)).toPromise();
        const dataClient = await coreSetup.elasticsearch.dataClient$.pipe(take(1)).toPromise();
        const savedObjectsClient = coreSetup.savedObjects.getScopedClient(req);

        return {
          savedObjects: {
            // Note: the client provider doesn't support new ES clients
            // emitted from adminClient$
            client: savedObjectsClient,
          },
          elasticsearch: {
            adminClient: adminClient.asScoped(req),
            dataClient: dataClient.asScoped(req),
          },
          uiSettings: {
            client: coreSetup.uiSettings.asScopedToClient(savedObjectsClient),
          },
        };
      }
    );
  }

  public async setupConfigSchemas() {
    const schemas: Array<[ConfigPath, Type<unknown>]> = [
      [elasticsearchConfig.path, elasticsearchConfig.schema],
      [loggingConfig.path, loggingConfig.schema],
      [httpConfig.path, httpConfig.schema],
      [pluginsConfig.path, pluginsConfig.schema],
      [devConfig.path, devConfig.schema],
      [kibanaConfig.path, kibanaConfig.schema],
      [savedObjectsConfig.path, savedObjectsConfig.schema],
      [uiSettingsConfig.path, uiSettingsConfig.schema],
    ];

    for (const [path, schema] of schemas) {
      await this.configService.setSchema(path, schema);
    }
  }
}
