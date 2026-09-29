# Razorpay Payment Gateway Documentation Index

**Snapshot date:** 2026-09-26
**Index metadata:** Last updated 30 April 2026; version 1.0.
**Inventory:** 338 Payment Gateway subtree entries from the fetched index (2,407 index lines).
**Use:** Discovery/reference catalog only; this 338-entry inventory is **not** an implementation checklist, test backlog, or progress denominator. The active acceptance scope is dry-cleaning invoice payments through Standard Checkout, as defined in [the current implementation plan](razorpay-finance-automation-implementation-plan.md). Only directly applicable Standard Web/API topics need a code/test mapping. The E-Commerce, Hotel, and Travel Standard Checkout pages are reference-only; unrelated platforms/products do not create tests unless an explicit in-scope dependency is found.

## Disposition Counts

- IN SCOPE - STANDARD WEB: 14
- DOC REFERENCE ONLY: 3 (e-commerce, hotel, travel; industry-specific behavior and tests excluded by dry-cleaning-only scope)
- NOT SELECTED - CUSTOM CHECKOUT: 33
- NOT SELECTED - HOSTED CHECKOUT: 4
- NOT SELECTED - QUICK: 3
- NOT SELECTED - S2S/RECURRING: 90
- OUT OF SCOPE - ECOMMERCE PLUGIN: 54
- OUT OF SCOPE - MOBILE WEBVIEW: 3
- OUT OF SCOPE - NATIVE/APP SDK: 91
- OUT OF SCOPE - ZOHO: 1
- REVIEW - SHARED GATEWAY TOPIC: 42

## Page Review Register

| Done | Documentation page | Initial disposition |
| --- | --- | --- |
| [x] | [How to Integrate Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway.md) | REVIEW - SHARED GATEWAY TOPIC; reviewed 2026-09-26; Standard Web selected, non-web integration branches excluded from CRM scope |
| [x] | [Callback URL](https://razorpay.com/docs/payments/payment-gateway/callback-url/) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Prerequisites \| Razorpay Capacitor Standard SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/capacitor-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Prerequisites \| Razorpay Cordova Standard SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/cordova-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [About Ecommerce Plugins](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [About EMI² Suite](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi².md) | REVIEW - SHARED GATEWAY TOPIC |
| [x] | [Features \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/features.md) | REVIEW - SHARED GATEWAY TOPIC; reviewed 2026-09-26; conditional features require merchant eligibility/configuration; no COD/saved-card/partial-pay/international/fee feature enabled by generic docs |
| [x] | [Razorpay Payment Gateway Flow](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/how-it-works.md) | REVIEW - SHARED GATEWAY TOPIC; reviewed 2026-09-26; server Order -> Checkout -> bank auth -> server verification/capture -> settlement; test demo warns of real auto-refunded transactions and is excluded |
| [ ] | [Prerequisites \| Razorpay Quick Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/quick-integration.md) | NOT SELECTED - QUICK |
| [ ] | [Handle Payment Exceptions with Rainy Day Kit](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Server-to-Server Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Zoho Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/zoho.md) | OUT OF SCOPE - ZOHO |
| [ ] | [Integrate With Android Custom SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Prerequisites \| Razorpay Android Standard SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Capacitor SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/capacitor-integration/integration-steps.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Capacitor Integration - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/capacitor-integration/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Cordova SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/cordova-integration/integration-steps.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Cordova Integration - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/cordova-integration/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Prerequisites \| Arastta - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/arastta.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| BigCommerce - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/bigcommerce.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Build Your Own - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/build-your-own.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| CS-Cart Plugin - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/cs-cart.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| Drupal Commerce - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/drupal-commerce.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| Easy Digital Downloads Plugin - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/easy-digital-downloads.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| Gravity Forms - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/gravity-forms.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| Magento Plugin - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/magento.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| OpenCart - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/open-cart.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| PrestaShop - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/prestashop.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Razorpay Shopify Integration \| 1Razorpay Shopify Integration \| Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Integrate Razorpay Shopify - Cash on Delivery](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify-cod.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Shopify Razorpay Secure Integration \| Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify-razorpay-secure.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| WHMCS - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/whmcs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| Wix - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/wix.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Razorpay WooCommerce Integration \| Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/woocommerce.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Prerequisites \| WordPress - Prerequisites](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/wordpress.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Eligibility Check API](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/eligibility-check.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Payment Gateway \| EMI² Suite - FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/faqs.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Payment Gateway \| EMI² Suite - Glossary](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/glossary.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Razorpay EMI² Use Cases](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/use-cases.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [About Affordability Widget](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [QuickBuy \| Razorpay Payment Gateway Features](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/features/quickbuy.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Razorpay Trusted Business Badge](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/features/trusted-business.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate With Flutter Custom SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Prerequisites \| Razorpay Flutter Standard SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate With iOS Custom SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Prerequisites \| Razorpay iOS Standard SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/standard.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Quick Integration - Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/quick-integration/integration-steps.md) | NOT SELECTED - QUICK |
| [ ] | [Quick Integration - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/quick-integration/troubleshooting-faqs.md) | NOT SELECTED - QUICK |
| [ ] | [Rainy Day \| Payment Capture Settings](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/capture-settings.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Rainy Day \| Payment Downtime API](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/downtime.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Rainy Day \| Errors](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/errors.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate With React Native Custom SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/custom.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Prerequisites \| Razorpay React Native Standard SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/standard.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Best Practices for S2S Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/best-practices.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Recurring Payments - S2S Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [About Server-to-Server Redirect Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/redirect.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Subscriptions - S2S Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/subscriptions.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Web Integration - Razorpay Custom Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Prerequisites \| Razorpay Hosted Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/hosted.md) | NOT SELECTED - HOSTED CHECKOUT |
| [x] | [Prerequisites \| Razorpay Standard Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [ ] | [Additional Support for Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/additional-features.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/build-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/go-live-checklist.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Google Play Console - Data Safety](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/google-data-safety.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [1. Native OTP Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/native-otp-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Razorpay OTP-Assist \| OTP Auto Read and Submit](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/otp-assist.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Override Minimum SDK Version](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/override-minimum-sdk.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/test-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [2. Test Native OTP Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/test-native-otp-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [UPI Intent Flow](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/upi-intent-flow.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Android Standard - Customise Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/customisation.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Google Play Console - Data Safety](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/google-data-safety.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Android SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/integration-steps.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Additional Support for Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/payment-methods.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Android Standard - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/cordova-integration/payment-methods/integration-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate with Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/cordova-integration/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Arastta - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/arastta/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Arastta - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/arastta/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| BigCommerce - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/bigcommerce/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| BigCommerce - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/bigcommerce/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/build-your-own/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| CS-Cart - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/cs-cart/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| CS-Cart - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/cs-cart/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Drupal Commerce - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/drupal-commerce/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Drupal Commerce - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/drupal-commerce/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Easy Digital Downloads - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/easy-digital-downloads/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Easy Digital Downloads - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/easy-digital-downloads/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Gravity Forms - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/gravity-forms/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Gravity Forms - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/gravity-forms/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Magento - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/magento/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/magento/troubleshooting.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| OpenCart - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/open-cart/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| OpenCart - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/open-cart/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| PrestaShop - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/prestashop/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| PrestaShop - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/prestashop/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Shopify \| Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify-razorpay-secure/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Initiate Refunds](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify-razorpay-secure/initiate-refunds.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Shopify Razorpay Secure Integration Steps \| Payment Gateway Setup](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify-razorpay-secure/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Reconcile Shopify Orders on the Dashboard](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify-razorpay-secure/reconcile-payments.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Shopify \| Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Initiate Refunds](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify/initiate-refunds.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Shopify Razorpay Integration Steps \| Payment Gateway Setup](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Accept International Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify/international-payments.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Migration Steps for Existing Users](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify/migration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Reconcile Shopify Orders on Dashboard](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/shopify/reconcile-payments.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| WHMCS - FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/whmcs/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| WHMCS - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/whmcs/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Wix - FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/wix/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| Wix - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/wix/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [WooCommerce Razorpay Integration Steps \| Payment Gateway Setup Guide](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/woocommerce/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| WooCommerce - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/woocommerce/troubleshooting-faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| WordPress - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/wordpress/faqs.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Payment Gateway \| WordPress - Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ecommerce-plugins/wordpress/integration-steps.md) | OUT OF SCOPE - ECOMMERCE PLUGIN |
| [ ] | [Configure EMI² Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/eligibility-check/configurations.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Razorpay EMI² Suite \| Standard - Eligibility Check](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/eligibility-check/standard.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Payment Methods in Custom Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/payment-methods/custom-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [About Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/payment-methods/standard-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Razorpay Affordability Widget With Android App](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/android.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Checkout From Widget \| Custom Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/custom-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Payment Gateway \| Affordability Widget - FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/faqs.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Razorpay Affordability Widget Features](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/features.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate the Widget on Your Website](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/native-web.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Checkout From Widget \| Server-to-Server (S2S) Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/s2s-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Affordability Widget With Shopify](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/shopify.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Checkout From Widget \| Standard Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/standard-integration.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Integrate Affordability Widget With WooCommerce Website](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/woocommerce.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/build-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/go-live-checklist.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/methods.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/test-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Flutter SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard/integration-steps.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Flutter - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/build-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Additional Configurations](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/configurations.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/go-live-checklist.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [1. Native OTP Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/native-otp.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Additional Support For Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/test-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [2. Test Native OTP Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/test-native-otp.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Troubleshooting and FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [iOS SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/standard/integration-steps.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| iOS Integration - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/standard/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Configure Payment Capture Settings using Orders API](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/capture-settings/api.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Rainy Day \| Error Codes](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/errors/error-codes.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Error Reasons](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/errors/error-reasons.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Rainy Day \| Payment Method Error Parameters](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/rainy-day/errors/payment-error-parameters.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Additional Support for Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/custom/additional-features.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/custom/build-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/custom/go-live-checklist.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/custom/test-integration.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Troubleshooting and FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/custom/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [React Native Android SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/standard/integration-steps-android.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [React Native iOS SDK - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/standard/integration-steps-ios.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| React Native - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/react-native-integration/standard/troubleshooting-faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Address Verification System](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/features/address-verification-system.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Razorpay OTP-Assist \| OTP Auto Read and Submit](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/features/otp-assist.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [About Server-to-Server JSON V1 Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [About Server-to-Server JSON V2 Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [CVV-less Flow for Card Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/cvv-less-flow.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Methods API](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/methods-api.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [MOTO Payments - S2S](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/moto.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [PayPal](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/paypal.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [About UPI Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/upi.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Wallets](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/wallet.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Postman Collection](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/postman-collection.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [UPI Autopay](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Webhooks](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/webhooks.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/redirect/build-integration.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/redirect/go-live-checklist.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/redirect/test-integration.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Best Practices](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/best-practices.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/build-integration.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Web Integration - Razorpay Custom Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/chargeback.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Features](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/go-live-checklist.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Input Restriction in Custom Fields](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/input-restriction.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Additional Support for Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/payment-methods.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [PhonePe Switch Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/phonepe-switch.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/test-integration.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/troubleshooting-faqs.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Hosted Web Integration - Best Practices \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/hosted/best-practices.md) | NOT SELECTED - HOSTED CHECKOUT |
| [ ] | [Hosted Integration - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/hosted/integration-steps.md) | NOT SELECTED - HOSTED CHECKOUT |
| [ ] | [Hosted Web Integration - Troubleshooting & FAQs \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/hosted/troubleshooting-faqs.md) | NOT SELECTED - HOSTED CHECKOUT |
| [x] | [Best Practices for Standard Checkout Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/best-practices.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Web Integration - Razorpay Standard Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/chargeback.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [About Payment Methods Configuration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-payment-methods.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Standard Web Integration - Configurability of Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-restrict-payment-methods.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; display customization is distinct from account enablement; restrictions configuration is on-demand and not used |
| [x] | [Standard Checkout - Integration Steps \| Razorpay Payment Gateway](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/integration-steps.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Payment Gateway \| Web Integration - Troubleshooting & FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/troubleshooting-faqs.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [ ] | [About Webview for Mobile Apps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/webview.md) | OUT OF SCOPE - MOBILE WEBVIEW |
| [ ] | [About Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI Mock SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/payment-methods/integration-mock.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/payment-methods/integration-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate with Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Turbo UPI SDK - Error Codes \| Cordova Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/cordova-integration/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Payment Gateway \| Android App - Customisation Options](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/android/customise.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Customisation Options](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/native-web/customise.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Affordability Widget \| Shopify - Customisation Options](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/shopify/customise.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [Affordability Widget \| WooCommerce - Customisation Options](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/emi²/widget/woocommerce/customise.md) | REVIEW - SHARED GATEWAY TOPIC |
| [ ] | [About Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [API Classes and Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard/payment-methods/api.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard/payment-methods/integration-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate with Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [About Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate with Turbo UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/standard/payment-methods/turbo-upi.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1/go-live-checklist.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1/test-integration.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/go-live-checklist.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/test-integration.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [CRED Pay](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/apps/cred.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3DS2 Protocol for Card Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/cards/3ds2.0.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [HSBC Credit Card](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/emi/hsbc.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [OneCard Credit Card EMI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/emi/one-card.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Supported Currencies](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/paypal/supported-currencies.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Customer Fee Bearer on Credit Card on UPI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/upi/cfb-cc-upi.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [S2S UPI Collect Flow](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/upi/collect.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [S2S UPI Intent Flow](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/upi/intent.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [About Saved VPA in Server-to-Server Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/upi/saved-vpa.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/cards/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Customer Fee Bearer (CFB) for Recurring Card Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/cards/customer-fee-bearer.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/cards/subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/cards/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/emandate/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Register Emandate and Charge First Payment Together](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/emandate/auto-debit.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/emandate/subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/emandate/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/paper-nach/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Register NACH and Charge First Payment Together](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/paper-nach/auto-debit.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/paper-nach/subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/paper-nach/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Execute Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/execute-subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/fetch-manage-tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Initiate Mandate Registration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/initiate-mandate-registration.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [4. Webhooks](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-intent/webhooks.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [UPI One-time Mandate \| FAQs](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/faqs.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Integrate UPI Reserve Pay](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-reserve-pay/integration-steps.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Manage Mandates and Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-reserve-pay/manage.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Webhooks](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-reserve-pay/webhooks.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-tpv/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-tpv/subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-tpv/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi/subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/wallets/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create Subsequent Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/wallets/subsequent-payments.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/wallets/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/redirect/build-integration/cards.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. E-Commerce Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/chargeback/build-integration-ecommerce.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [1. Hotel Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/chargeback/build-integration-hotel.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [1. Travel Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/chargeback/build-integration-travel.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/chargeback/go-live-checklist.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/chargeback/test-integration.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Enable Guest Checkout Payments With Alt ID](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/alt-id-checkout.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Create Async Payment](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/async-payments.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Check CRED Eligibility](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/check-cred-eligibility.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [CVV-less Flow for Card Payments](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/cvv-less-flow.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Native OTP](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/native-otp.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Custom Web Integration - Bring a Popup to the Front](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/pop-up.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Save Customer Card Details as Network Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/saved-cards.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Save customer card details on Custom Checkout](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/saved-cards-old.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Saved VPA](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/saved-vpa.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Custom Web Integration - Validate VPA](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/validate-vpa.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [About Webview for Mobile Apps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/webview.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [UPI Intent on Mobile Web](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/payment-methods/upi-intent-mweb.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [x] | [1. E-Commerce Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/chargeback/build-integration-ecommerce.md) | DOC REFERENCE ONLY; reviewed 2026-09-26; e-commerce-specific behavior/payloads/tests excluded; project acceptance is dry-cleaning invoice checkout only |
| [x] | [1. Hotel Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/chargeback/build-integration-hotel.md) | DOC REFERENCE ONLY; reviewed 2026-09-26; hotel-specific behavior/payloads/tests excluded; project acceptance is dry-cleaning invoice checkout only |
| [x] | [1. Travel Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/chargeback/build-integration-travel.md) | DOC REFERENCE ONLY; reviewed 2026-09-26; travel-specific behavior/payloads/tests excluded; project acceptance is dry-cleaning invoice checkout only |
| [x] | [3. Go-live Checklist](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/chargeback/go-live-checklist.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [2. Test Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/chargeback/test-integration.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Display the Configuration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/display-configuration.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Sample Codes](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/sample-code.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Supported Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/supported-methods.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Understand the Configuration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-payment-methods/understand-configuration.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; see plan verification log |
| [x] | [Sample Codes - Configurability of Payment Methods](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/configure-restrict-payment-methods/sample-code.md) | IN SCOPE - STANDARD WEB; reviewed 2026-09-26; examples mapped to current runtime display config; UPI Collect deprecation migration takes precedence for non-exempt merchants |
| [ ] | [Integration Steps](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/webview/integration-steps.md) | OUT OF SCOPE - MOBILE WEBVIEW |
| [ ] | [UPI Intent in WebView - Android](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-android.md) | OUT OF SCOPE - MOBILE WEBVIEW |
| [ ] | [UPI Intent in WebView - iOS](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/standard/webview/upi-intent-ios.md) | OUT OF SCOPE - MOBILE WEBVIEW |
| [ ] | [Turbo UPI SDK - Error Codes \| Android Custom](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Frequently Asked Questions (FAQs)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI (Headless) on Android App](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/integration-noui.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI Headless Mock SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/integration-noui-mock.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/integration-noui-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI (with UI) on Android App](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/integration-ui.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI UI Mock SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/integration-ui-mock.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/custom/payment-methods/turbo-upi/integration-ui-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Turbo UPI SDK - Error Codes \| Android Standard Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/android-integration/standard/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Turbo UPI SDK - Error Codes \| Flutter Custom Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Frequently Asked Questions (FAQs)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods/turbo-upi/faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI Headless](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods/turbo-upi/integration-noui.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods/turbo-upi/integration-noui-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI UI with TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/custom/payment-methods/turbo-upi/integration-ui-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Turbo UPI SDK - Error Codes \| Flutter Standard Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/flutter-integration/standard/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Turbo UPI SDK - Error Codes \| iOS Custom Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Frequently Asked Questions (FAQs)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/faqs.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI Headless](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/integrate-noui.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI UI](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/integrate-ui.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI Headless Mock SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/integration-noui-mock.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI UI Mock SDK](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/integration-ui-mock.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Integrate Turbo UPI UI with TPV](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/custom/payment-methods/turbo-upi/integration-ui-tpv.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [Turbo UPI SDK - Error Codes \| iOS Standard Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/ios-integration/standard/payment-methods/turbo-upi/error-codes.md) | OUT OF SCOPE - NATIVE/APP SDK |
| [ ] | [1. Build Integration for Cards (New Integration)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1/build-integration/cards.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [ACH Direct Debit](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/ach.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for Cards (New Integration)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/cards.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [FPX](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/fpx.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for Netbanking](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/netbanking.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Single Integration API](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/single-integration-api.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Native OTP](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/cards/authentication-type/native-otp.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Build Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/payment-methods/upi/saved-vpa/build-integration.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/collect/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create a One Time Payment](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/collect/one-time-payment.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/collect/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Create the Authorisation Transaction](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/intent/authorization-transaction.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3. Create a One Time Payment](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/intent/one-time-payment.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [2. Fetch and Manage Tokens](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/recurring-payments/upi-otm/intent/tokens.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3DS2 Migration Guide for Existing S2S Cards Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/redirect/build-integration/cards/migrate-3ds2.0.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [Business Seeks Customer Consent, Saves Card Details With Razorpay](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/saved-cards/scenario-1.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Razorpay Seeks Customer Consent on Behalf of Business](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/saved-cards/scenario-2.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [Business Seeks Consent from Some Customers Only](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/saved-cards/scenario-3.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [UPI Intent in WebView - Android](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/webview/upi-intent-android.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [UPI Intent in WebView - iOS](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/web-integration/custom/features/webview/upi-intent-ios.md) | NOT SELECTED - CUSTOM CHECKOUT |
| [ ] | [3DS2 Migration Guide for Existing S2S Cards Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1/build-integration/cards/migrate-3ds2.0.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for UPI Collect](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1/build-integration/upi/collect.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for UPI Intent](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v1/build-integration/upi/intent.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3DS 2 Migration Guide - Browser Flow Cards Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/cards/browser.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3DS 2 Migration Guide - EMV 3DS 2 SDK Cards Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/cards/evm-sdk.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [3DS2 Migration Guide for Existing S2S Cards Integration](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/cards/migrate-3ds2.0.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for International Cards (E-commerce)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/international-cards/e-commerce.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for International Cards (Hotel)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/international-cards/hotel.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for International Cards (Travel)](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/international-cards/travel.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for UPI Collect](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/upi/collect.md) | NOT SELECTED - S2S/RECURRING |
| [ ] | [1. Build Integration for UPI Intent](https://razorpay.com/docs/build/llm-docs/payments/payment-gateway/s2s-integration/json/v2/build-integration/upi/intent.md) | NOT SELECTED - S2S/RECURRING |
