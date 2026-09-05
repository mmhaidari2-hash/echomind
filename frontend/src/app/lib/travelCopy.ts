import type { Locale } from "./direction";
import type { TravelServiceType } from "./travelIntent";

export const travelCopy = {
  en: {
    title: "Travel & Transport",
    hint: "Say where and when — EchoMind drafts a one-tap trip card.",
    approval: "1-tap approval",
    hotel: "Hotel",
    arrival: "Estimated arrival",
    price: "Trip total",
    nights: "nights",
    confirm: "Confirm trip",
    confirming: "Confirming…",
    confirmed: "Trip confirmed",
    secure: "Signed confirmation · expires in 15 minutes",
    missing: "Add a destination to get a quote.",
    failed: "Could not confirm that trip. Try again.",
    services: {
      flight: "Flight",
      train: "Train",
      hotel: "Hotel stay",
      taxi: "Taxi",
      bus: "Coach",
      unknown: "Trip",
    } satisfies Record<TravelServiceType, string>,
  },
  fa: {
    title: "سفر و حمل‌ونقل",
    hint: "مقصد و زمان را بگویید — اکومایند کارت تأیید یک‌ضرب می‌سازد.",
    approval: "تأیید یک‌ضرب",
    hotel: "هتل",
    arrival: "رسیدن تقریبی",
    price: "جمع سفر",
    nights: "شب",
    confirm: "تأیید سفر",
    confirming: "در حال تأیید…",
    confirmed: "سفر تأیید شد",
    secure: "تأیید امضاشده · تا ۱۵ دقیقه معتبر است",
    missing: "برای برآورد قیمت یک مقصد بنویسید.",
    failed: "تأیید سفر ممکن نشد. دوباره تلاش کنید.",
    services: {
      flight: "پرواز",
      train: "قطار",
      hotel: "اقامت هتل",
      taxi: "تاکسی",
      bus: "اتوبوس",
      unknown: "سفر",
    } satisfies Record<TravelServiceType, string>,
  },
} as const;

export function travelText(locale: Locale) {
  return travelCopy[locale];
}
