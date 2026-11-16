import { ApplicationInsights } from '@microsoft/applicationinsights-web';

import { config } from '@/lib/config';

import type { ITelemetryItem } from '@microsoft/applicationinsights-web';

/**
 * Adds Fluent's context to every browser telemetry item: the cloud role, so browser rows are
 * not blank in `AppRoleName`, and the build's environment, since one App Insights resource
 * receives every environment's browser telemetry. Custom properties belong in `item.data`; the
 * SDK copies them into `customDimensions`.
 */
export function addAppContext(item: ITelemetryItem, environment: string): boolean {
  item.tags = { ...item.tags, 'ai.cloud.role': 'fluent-web' };
  item.data = {
    ...item.data,
    environment,
    browserSize: `${window.innerWidth}x${window.innerHeight}`,
    screenResolution: `${screen.width}x${screen.height}`,
  };
  return true;
}

class AppInsightsService {
  private appInsights?: ApplicationInsights;
  private isInitialized = false;

  constructor() {
    if (!config.monitoring.appInsightsConnectionString) {
      if (config.environment.isDevelopment) {
        console.warn(
          'Application Insights connection string not configured - logging will fall back to console'
        );
      }
      return;
    }

    try {
      this.appInsights = new ApplicationInsights({
        config: {
          connectionString: config.monitoring.appInsightsConnectionString,
          enableAutoRouteTracking: true,
          enableCorsCorrelation: true,
          enableRequestHeaderTracking: true,
          enableResponseHeaderTracking: true,
          enableAjaxErrorStatusText: true,
          enableUnhandledPromiseRejectionTracking: true,
          disableExceptionTracking: false,
          enablePerfMgr: true,
        },
      });

      this.appInsights.loadAppInsights();
      this.initialize();
      this.isInitialized = true;
      if (config.environment.isDevelopment) {
        console.warn('✅ Application Insights initialized successfully');
      }
    } catch (error) {
      if (config.environment.isDevelopment) {
        console.error('❌ Failed to initialize Application Insights:', error);
      }
      this.appInsights = undefined;
    }
  }

  private initialize(): void {
    if (!this.appInsights) return;

    this.appInsights.addTelemetryInitializer(item =>
      addAppContext(item, config.environment.current)
    );

    this.appInsights.trackPageView();
  }

  setUser(userId: string, accountId?: string): void {
    if (!this.appInsights) {
      if (config.environment.isDevelopment) {
        console.warn('Cannot set user context - Application Insights not initialized');
      }
      return;
    }

    // The SDK records the ID as `user_AuthenticatedId`; names and emails stay out of telemetry.
    this.appInsights.setAuthenticatedUserContext(userId, accountId);
  }

  getInstance(): ApplicationInsights | undefined {
    return this.appInsights;
  }

  isReady(): boolean {
    return this.isInitialized && !!this.appInsights;
  }
}

const appInsightsService = new AppInsightsService();
export default appInsightsService;
