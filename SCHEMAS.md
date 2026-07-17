# Trade Republic API Schemas

Generated from `src/schemas/registry.ts`. These schemas validate raw Trade Republic responses before SDK normalization.

| Name | Risk | Transport | Request | Variants |
| --- | --- | --- | --- | --- |
| `auth.session` | `read` | `rest` | `GET /api/v1/auth/web/session` |  |
| `auth.account` | `read` | `rest` | `GET /api/v2/auth/account` |  |
| `account.personalDetails` | `read` | `rest` | `GET /api/v1/customer/personal-details` |  |
| `account.relationships` | `read` | `rest` | `GET /api/v1/customer/relationships/detailed` |  |
| `account.cardsHome` | `read` | `rest` | `GET /api/v1/card/cards/home` |  |
| `boards.list` | `read` | `rest` | `GET /api-gateway/pro-trading/api/v2/boards` |  |
| `boards.detail` | `read` | `rest` | `GET /api-gateway/pro-trading/api/v2/boards/{boardId}` |  |
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
| `portfolio.current` | `read` | `websocket` | `compactPortfolioByTypeV2` |  |
| `portfolio.cash` | `read` | `websocket` | `availableCash` |  |
| `portfolio.markToMarketValue` | `read` | `websocket` | `portfolioStatus` |  |
| `portfolio.savingsPlans` | `read` | `websocket` | `savingsPlans` |  |
| `portfolio.privateMarketsPositions` | `read` | `websocket` | `privateMarketsPositions` |  |
| `portfolio.portfolioChart` | `read` | `rest` | `GET /api-gateway/portfolio-chart/v2/chart` |  |
| `market.subscriptions` | `read` | `websocket` | `accountPairs` |  |
| `market.candles` | `read` | `websocket` | `aggregateHistoryLightV2` | stock, crypto |
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
| `trading.trades` | `read` | `rest` | `GET /web-trading-gateway/api/customer/v1/trades` |  |
| `trading.dailyPnl` | `read` | `rest` | `POST /web-trading-gateway/api/customer/v1/pnl/daily` |  |
| `discovery.exchangeDetails` | `read` | `rest` | `GET /api-gateway/instrument-universe/api/v1/exchanges-details` |  |
| `discovery.exchangeSchedule` | `read` | `rest` | `GET /api-gateway/instrument-universe/api/v1/exchanges/{exchange}/schedule` |  |
| `discovery.instrumentStatus` | `read` | `rest` | `GET /api-gateway/instrument-universe/api/v1/instruments/{isin}/status/{exchange}` |  |
| `discovery.watchlists` | `read` | `rest` | `GET /api-gateway/watchlists/api/v2/watchlists` |  |
| `discovery.watchlists.items` | `read` | `rest` | `GET /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/items` |  |
| `discovery.watchlists.clone` | `lowRiskMutation` | `rest` | `POST /api-gateway/watchlists/api/v2/watchlists/{watchlistId}/clone` |  |
| `discovery.watchlists.rename` | `lowRiskMutation` | `rest` | `PUT /api-gateway/watchlists/api/v2/watchlists/{watchlistId}` |  |
| `discovery.watchlists.delete` | `lowRiskMutation` | `rest` | `DELETE /api-gateway/watchlists/api/v2/watchlists/{watchlistId}` |  |
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
| `payments.paymentMethods` | `read` | `rest` | `GET /api/v2/payment/methods` |  |
| `payments.iban` | `read` | `rest` | `GET /api/v1/customer/relationships/detailed` |  |
| `blocked.orderMutations` | `blockedMutation` | `websocket` | `confirmOrder\|changeOrder` |  |
| `blocked.bankTransfers` | `blockedMutation` | `rest` | `POST /api/v1/payout and payment authorization paths` |  |
| `blocked.documentAcceptance` | `blockedMutation` | `rest` | `api/v1/documents/group/accept and terms accept paths` |  |
| `blocked.accountSecurity` | `blockedMutation` | `rest` | `change account/tax/security paths` |  |

`highRiskMutation` entries can move money or alter live orders and must never be exercised by unattended integration tests. `blockedMutation` entries remain unsupported.
