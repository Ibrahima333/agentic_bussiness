import React from "react";
import { AppState } from "../types";
import { ResultTabs } from "./ResultTabs";
import { Bot, User, Sparkles, Database, Cpu } from "lucide-react";
import { motion } from "motion/react";

interface ChatAreaProps {
  state: AppState;
}

export function ChatArea({ state }: ChatAreaProps) {
  const activeResult = state.activeResult;
  const isReady = state.databases.length > 0 && state.selectedDatabase;

  if (state.isBootstrapping) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
        <Sparkles className="w-5 h-5 animate-pulse mr-2" />
        Chargement…
      </div>
    );
  }

  if (state.activeResultId && !activeResult) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-slate-400 text-sm">
        Chargement du résultat…
      </div>
    );
  }

  if (!activeResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 pb-48 overflow-y-auto">
        {/* État vide selon la progression */}
        {!isReady ? (
          <div className="space-y-6 max-w-sm">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
              <Sparkles className="w-8 h-8 text-slate-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Bienvenue sur Agentic BI</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Commencez par configurer votre base de données et votre modèle LLM dans la sidebar.
              </p>
            </div>
            <div className="flex flex-col gap-2 text-sm text-left">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Database className="w-3.5 h-3.5 text-blue-600" />
                </div>
                <span className="text-slate-600">Connectez votre base de données</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                  <Cpu className="w-3.5 h-3.5 text-violet-600" />
                </div>
                <span className="text-slate-600">Configurez votre modèle LLM</span>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 opacity-40">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <span className="text-slate-600">Posez une question en langage naturel</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-w-sm">
            <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
              <Sparkles className="w-8 h-8 text-blue-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Prêt à analyser</h2>
              <p className="text-slate-400 text-sm">
                Posez une question en français ou anglais sur <strong className="text-slate-600">{state.selectedDatabase}</strong>.
              </p>
            </div>
            <div className="text-xs text-slate-400 bg-slate-50 rounded-xl p-3 border border-slate-100 text-left space-y-1">
              <p className="font-semibold text-slate-500 mb-2">Exemples :</p>
              <p>• Quels sont les 5 meilleurs clients ?</p>
              <p>• Montre-moi le chiffre d'affaires par mois</p>
              <p>• Quelles sont les commandes en retard ?</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-48">
      {/* Question utilisateur */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="flex gap-3 max-w-[80%]">
          <div className="bg-blue-600 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm shadow-sm">
            <p className="text-[15px] leading-relaxed">{activeResult.questionText}</p>
          </div>
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0 border border-blue-200 mt-1">
            <User className="w-4 h-4 text-blue-700" />
          </div>
        </div>
      </motion.div>

      {/* Réponse agent */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="flex gap-3 max-w-[95%] w-full">
        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200 mt-1">
          <Bot className="w-4 h-4 text-slate-600" />
        </div>
        <div className="w-full space-y-3">
          <div className="bg-white border border-slate-200 px-5 py-3.5 rounded-2xl rounded-tl-sm shadow-sm inline-block">
            <p className="text-sm text-slate-600 leading-relaxed">
              Analyse sur <strong className="text-slate-900">{activeResult.databaseName}</strong>
              {activeResult.schemaName && <> · {activeResult.schemaName}</>}
              {" "}via <span className="font-medium text-violet-700">{activeResult.providerName}</span>
            </p>
          </div>

          {state.errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {state.errorMessage}
            </div>
          )}

          <ResultTabs result={activeResult} />
        </div>
      </motion.div>
    </div>
  );
}
