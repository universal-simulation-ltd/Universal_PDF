import app from './app'
import menu from './menu'
import viewer from './viewer'
import annotate from './annotate'
import sign from './sign'
import tools from './tools'
import lib from './lib'

export const en = { app, menu, viewer, annotate, sign, tools, lib }

/** The shape every language must match exactly. */
export type Messages = {
  [N in keyof typeof en]: { [K in keyof (typeof en)[N]]: string }
}
