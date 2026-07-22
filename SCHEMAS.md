# Trade Republic API Schemas

Generated from `src/schemas/registry.ts`. These schemas validate raw Trade Republic responses before SDK normalization.

| Name | Risk | Transport | Request | Variants |
| --- | --- | --- | --- | --- |
| `auth.session` | `read` | `rest` | `GET /api/v1/auth/web/session` |  |
| `auth.account` | `read` | `rest` | `GET /api/v2/auth/account` |  |
| `account.personalDetails` | `read` | `rest` | `GET /api/v1/customer/personal-details` |  |
| `account.appUsageConsents` | `read` | `rest` | `GET /api/v1/customer/app-usage-data-consents` |  |
| `account.relationships` | `read` | `rest` | `GET /api/v1/customer/relationships/detailed` |  |
| `account.cardsHome` | `read` | `rest` | `GET /api/v1/card/cards/home` |  |
| `assets.search` | `read` | `websocket` | `neonSearch` | stock, crypto, etf -> fund, mutualFund, privateFund, bond, synthetic |
| `assets.get` | `read` | `websocket` | `instrument` |  |
| `derivatives.search` | `read` | `websocket` | `neonSearch type=derivative` |  |
| `derivatives.listForUnderlying` | `read` | `websocket` | `derivatives` |  |
| `orders.all` | `read` | `rest` | `GET /web-trading-gateway/api/customer/v1/orders` |  |
| `orders.mutualFunds` | `read` | `rest` | `GET /api-gateway/mutual-funds/api/v1/orders` |  |
| `orders.privateMarkets` | `read` | `rest` | `GET /api/v1/private-markets/orders/all` |  |
| `orders.orderUpdates` | `read` | `websocket` | `orderUpdates` |  |
| `orders.fees` | `read` | `websocket` | `orderFeesV2` |  |
| `orders.submit` | `highRiskMutation` | `websocket` | `simpleCreateOrder` | received, waiting, confirmationNeeded, succeeded, failed: exchangeClosed (observed live), failed: cashMissing, failed: currentQuoteMissing, failed: instrumentSuspended, failed: internalError, failed: invalidSecurityDerivative, failed: invalidSecurityNonDerivative, failed: limitDenied, failed: maxQuantityExceeded, failed: noRefPriceAvailable, failed: noRouteToMarket, failed: orderAlreadyDeleted, failed: orderAlreadyExists, failed: orderNotFound (observed live cancellation), failed: orderRejectedAtExchange, failed: portfolioInactive, failed: quoteMissing, failed: savingsplanSharesMissingToday, failed: sharesMissing, failed: shortPositionNotAllowed, failed: timeoutError, failed: unknownInstrument |
| `orders.cancel` | `highRiskMutation` | `websocket` | `cancelOrder` | received, waiting, confirmationNeeded, succeeded, failed: exchangeClosed (observed live), failed: cashMissing, failed: currentQuoteMissing, failed: instrumentSuspended, failed: internalError, failed: invalidSecurityDerivative, failed: invalidSecurityNonDerivative, failed: limitDenied, failed: maxQuantityExceeded, failed: noRefPriceAvailable, failed: noRouteToMarket, failed: orderAlreadyDeleted, failed: orderAlreadyExists, failed: orderNotFound (observed live cancellation), failed: orderRejectedAtExchange, failed: portfolioInactive, failed: quoteMissing, failed: savingsplanSharesMissingToday, failed: sharesMissing, failed: shortPositionNotAllowed, failed: timeoutError, failed: unknownInstrument |
| `orders.replace` | `highRiskMutation` | `websocket` | `cancelOrder -> simpleCreateOrder (non-atomic)` | succeeded, failed, outcomeUnknown, replacementNotSent, cancelFailed, cancelOutcomeUnknown |
| `portfolio.current` | `read` | `websocket` | `compactPortfolioByTypeV2` |  |
| `portfolio.cash` | `read` | `websocket` | `availableCash` |  |
| `portfolio.markToMarketValue` | `read` | `websocket` | `portfolioStatus` |  |
| `portfolio.savingsPlans` | `read` | `websocket` | `savingsPlans` |  |
| `portfolio.privateMarketsPositions` | `read` | `websocket` | `privateMarketsPositions` |  |
| `portfolio.portfolioChart` | `read` | `rest` | `GET /api-gateway/portfolio-chart/v2/chart` |  |
| `portfolio.bondValuation` | `read` | `websocket` | `bondValuationV2` |  |
| `portfolio.fixedSavingsValuation` | `read` | `websocket` | `fixedSavingsValuation` |  |
| `market.subscriptions` | `read` | `rest` | `GET /api-gateway/subscriptions/api/v1/subscriptions` |  |
| `market.entitlements` | `read` | `rest` | `GET /api-gateway/subscriptions/api/v1/entitlements/topics/{topic}` |  |
| `market.candles.standard` | `read` | `websocket` | `tradeAggregateHistory` | stock, etf, fund, mutualFund |
| `market.candles.light` | `read` | `websocket` | `aggregateHistoryLightV2` | derivative, crypto |
| `market.candles.bond` | `read` | `rest` | `GET /api-gateway/quotes-api/v1/instruments/{isin}.{exchangeId}/ytm/aggregateHistory` | bond |
| `market.quote` | `read` | `websocket` | `ticker` | stock, crypto |
| `market.liveFeed` | `read` | `websocket` | `tickerV3` | stock, crypto |
| `market.availableL2Books` | `read` | `websocket` | `instrument` |  |
| `market.l2OrderBook` | `read` | `websocket` | `L2` |  |
| `timeline.list` | `read` | `websocket` | `timelineActivityLog` |  |
| `timeline.actions` | `read` | `websocket` | `timelineActionsV2` |  |
| `timeline.detail` | `read` | `websocket` | `timelineDetailV2` |  |
| `priceAlarms.list` | `read` | `websocket` | `priceAlarms` |  |
| `priceAlarms.notifications` | `read` | `websocket` | `priceAlarmNotifications` |  |
| `priceAlarms.create` | `lowRiskMutation` | `websocket` | `createPriceAlarm` |  |
| `priceAlarms.cancel` | `lowRiskMutation` | `websocket` | `cancelPriceAlarm` |  |
| `instruments.news` | `read` | `websocket` | `neonNews` |  |
| `instruments.etfDetails` | `read` | `websocket` | `etfDetails` |  |
| `instruments.etfComposition` | `read` | `websocket` | `etfComposition` |  |
| `instruments.fundDetails` | `read` | `websocket` | `mutualFundDetails` |  |
| `instruments.fundComposition` | `read` | `websocket` | `mutualFundComposition` |  |
| `instruments.cryptoDetails` | `read` | `websocket` | `cryptoDetails` |  |
| `instruments.yieldToMaturity` | `read` | `websocket` | `yieldToMaturity` |  |
| `trading.priceForOrder` | `read` | `websocket` | `priceForOrderV2` |  |
| `trading.availableSize` | `read` | `websocket` | `availableSize` |  |
| `trading.homeOrderDestination` | `read` | `websocket` | `homeInstrumentExchange` |  |
| `trading.orderDestinations` | `read` | `rest` | `GET /api-gateway/order-router/api/v2/instruments/{isin}/destinations?jurisdiction=DE` |  |
| `trading.orderBookSnapshot` | `read` | `rest` | `GET /web-trading-gateway/api/customer/v1/trades/{tradeId}/order-book-snapshot` |  |
| `trading.tapeSnapshot` | `read` | `rest` | `GET /web-trading-gateway/api/customer/v1/trades/{tradeId}/tape-snapshot` |  |
| `trading.dailyPnl` | `read` | `rest` | `POST /web-trading-gateway/api/customer/v1/pnl/daily` |  |
| `trading.tape` | `read` | `websocket` | `tape` |  |
| `trading.tradeAggregateHistory` | `read` | `websocket` | `tradeAggregateHistory` |  |
| `discovery.exchangeDetails` | `read` | `rest` | `GET /api-gateway/instrument-universe/api/v1/exchanges-details` |  |
| `discovery.exchangeSchedule` | `read` | `rest` | `GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule` |  |
| `discovery.instrumentStatus` | `read` | `rest` | `GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}` |  |
| `discovery.watchlists` | `read` | `rest` | `GET /api-gateway/watchlists/api/v2/watchlists` |  |
| `discovery.watchlists.items` | `read` | `rest` | `GET /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items` |  |
| `discovery.watchlists.addItem` | `lowRiskMutation` | `rest` | `POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items` |  |
| `discovery.watchlists.removeItem` | `lowRiskMutation` | `rest` | `DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items/{instrumentId}` |  |
| `discovery.screeners` | `read` | `rest` | `GET /api-gateway/screeners/api/v2/screeners` |  |
| `discovery.screenerOptions` | `read` | `rest` | `GET /api-gateway/screeners/api/v2/screeners/options` |  |
| `discovery.userPreferences` | `read` | `rest` | `GET /api-gateway/pro-trading/api/v1/user-preferences` |  |
| `documents.documents` | `read` | `rest` | `GET /api/v1/documents/all` |  |
| `tax.taxInformation` | `read` | `rest` | `GET /api/v1/taxes/information` |  |
| `tax.exemptionOrder` | `read` | `rest` | `GET /api/v1/taxes/exemptionorders` |  |
| `tax.taxResidencies` | `read` | `rest` | `GET /api/v1/auth/account/change/taxresidencies` |  |
| `tax.taxResidencyCountries` | `read` | `rest` | `GET /api/v1/country/taxresidency` |  |
| `tax.accountUtilization` | `read` | `websocket` | `taxWrapperAccountUtilization` |  |
| `payments.paymentMethods` | `read` | `rest` | `GET /api/v2/payment/methods` |  |
| `payments.iban` | `read` | `rest` | `GET /api/v1/customer/relationships/detailed` |  |

`highRiskMutation` entries can move money or alter live orders. Unattended probes require explicit clock, venue-state, price-distance, non-replay, and cleanup safeguards.
