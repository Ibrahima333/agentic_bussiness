import React from "react";
import { AppState } from "../types";
import { ResultTabs } from "./ResultTabs";
import { Bot, User, BarChart2 } from "lucide-react";
import { motion } from "motion/react";

interface ChatAreaProps { state: AppState; }

export function ChatArea({ state }: ChatAreaProps) {
  const activeResult = state.activeResult;
  const isReady = state.databases.length > 0 && state.selectedDatabase;

  if (state.isBootstrapping) {
    return <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">Chargement…</div>;
  }
  if (state.activeResultId && !activeResult) {
    return <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm">Chargement du résultat…</div>;
  }

  if (!activeResult) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10 pb-52">
        {!isReady ? (
          <div className="max-w-xs space-y-8">
            <div className="mx-auto w-14 h-14 rounded-2xl border-2 border-zinc-200 flex items-center justify-center">
              <BarChart2 className="w-6 h-6 text-zinc-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-2">Bienvenue sur AskData</h2>
              <p className="text-sm text-zinc-500 leading-relaxed">Connectez votre base et posez vos questions en français.</p>
            </div>
            <div className="text-left space-y-2">
              {[
                "Connectez votre base de données",
                "Configurez votre modèle LLM",
                "Posez une question",
              ].map((label, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200">
                  <div className="w-6 h-6 rounded-full border border-zinc-300 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-zinc-500">{i + 1}</span>
                  </div>
                  <span className="text-sm text-zinc-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-xs space-y-5">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center">
              <BarChart2 className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 mb-1">Prêt à analyser</h2>
              <p className="text-sm text-zinc-500">Base : <code className="font-mono text-zinc-700 font-medium">{state.selectedDatabase}</code></p>
            </div>
            <div className="text-left text-xs text-zinc-400 bg-zinc-50 rounded-lg p-4 border border-zinc-200 space-y-1.5">
              <p className="font-semibold text-zinc-500 mb-2">Exemples :</p>
              <p>— Quels sont les 5 meilleurs clients ?</p>
              <p>— Chiffre d'affaires par mois cette année</p>
              <p>— Commandes en attente depuis plus de 7 jours</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-48">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="flex gap-3 max-w-[78%]">
          <div className="bg-zinc-900 text-white px-5 py-3.5 rounded-2xl rounded-tr-sm">
            <p className="text-[15px] leading-relaxed">{activeResult.questionText}</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center shrink-0 mt-1">
            <User className="w-4 h-4 text-zinc-500" />
          </div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="flex gap-3 max-w-[95%] w-full">
        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 mt-1">
          <Bot className="w-4 h-4 text-indigo-500" />
        </div>
        <div className="w-full space-y-3">
          <div className="bg-zinc-50 border border-zinc-200 px-5 py-3.5 rounded-2xl rounded-tl-sm inline-block">
            <p className="text-sm text-zinc-600 leading-relaxed">
              Analyse sur <code className="bg-zinc-200 px-1.5 py-0.5 rounded text-zinc-800 text-xs">{activeResult.databaseName}</code>
              {activeResult.schemaName && <> · <code className="bg-zinc-200 px-1.5 py-0.5 rounded text-zinc-800 text-xs">{activeResult.schemaName}</code></>}
              {" "}via <span className="font-medium text-indigo-600">{activeResult.providerName}</span>
            </p>
          </div>
          {state.errorMessage && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{state.errorMessage}</div>
          )}
          <ResultTabs result={activeResult} />
        </div>
      </motion.div>
    </div>
  );
}
