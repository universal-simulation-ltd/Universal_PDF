import app from './app.ts'
import menu from './menu.ts'
import viewer from './viewer.ts'
import annotate from './annotate.ts'
import sign from './sign.ts'
import tools from './tools.ts'
import lib from './lib.ts'

export const en = { app, menu, viewer, annotate, sign, tools, lib }

/** The shape every language must match exactly. */
export type Messages = {
  [N in keyof typeof en]: { [K in keyof (typeof en)[N]]: string }
}
