import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

function installDomMutationGuards() {
  const safeDomCall = <T,>(fn: () => T, fallback: T): T => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        if (import.meta.env.DEV) {
          console.warn("[DOMGuard] NotFoundError evitado em operação DOM.", error);
        }
        return fallback;
      }
      throw error;
    }
  };

  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChildGuard(child: Node): Node {
    if (child.parentNode !== this) return child;
    return safeDomCall(() => originalRemoveChild.call(this, child), child);
  };

  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBeforeGuard<T extends Node>(
    newNode: T,
    referenceNode: Node | null
  ): T {
    return safeDomCall(() => originalInsertBefore.call(this, newNode, referenceNode), newNode);
  };
}

installDomMutationGuards();

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Elemento #root não encontrado no DOM");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);


