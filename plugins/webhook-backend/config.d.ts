/**
 * Configuration options for the webhook plugin
 * @public
 */
export interface Config {
  /**
   * Webhook plugin configuration
   */
  webhook?: {
    /**
     * Authentication settings for webhook endpoints
     */
    auth?: {
      /**
       * Basic auth username
       * @visibility secret
       */
      username?: string;
      /**
       * Basic auth password
       * @visibility secret
       */
      password?: string;
    };
  };
}
