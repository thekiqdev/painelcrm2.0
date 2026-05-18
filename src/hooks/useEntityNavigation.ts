import { useCallback } from "react";

import { useNavigate } from "react-router-dom";

import {

  fetchLeadConvertedClientId,

  resolveEntityIdentity,

} from "@/lib/entity/resolveEntityIdentity";

import { getClientUrl, getLeadUrl, isValidEntityId } from "@/lib/entityNavigation";

import { entityDrawerStore, type EntityDrawerEntityType } from "@/stores/entityDrawerStore";



export type EntityOpenMode = "route" | "drawer";



export type EntityNavigationOptions = {

  mode?: EntityOpenMode;

  tab?: string;

  replace?: boolean;

  state?: unknown;

  /** Cliente gerado na conversão (evita GET quando já conhecido). */

  convertedToClientId?: string | null;

  /** Alias de `convertedToClientId` (campo `migrated_client_id` da API). */

  migratedClientId?: string | null;

};



export function useEntityNavigation() {

  const navigate = useNavigate();



  const openEntityResolved = useCallback(

    (type: EntityDrawerEntityType, id: string, options?: EntityNavigationOptions) => {

      const mode = options?.mode ?? "drawer";

      if (mode === "drawer") {

        entityDrawerStore.open(type, id, {
          convertedToClientId: options?.convertedToClientId,
          migratedClientId: options?.migratedClientId,
        });

        return;

      }

      if (type === "client") {

        navigate(getClientUrl(id, { tab: options?.tab }), {

          replace: options?.replace,

          state: options?.state,

        });

      } else {

        navigate(getLeadUrl(id), {

          replace: options?.replace,

          state: options?.state,

        });

      }

    },

    [navigate],

  );



  const openEntity = useCallback(

    (type: EntityDrawerEntityType, id: string, options?: EntityNavigationOptions) => {

      if (!isValidEntityId(id)) return;

      const entityId = id.trim();



      const convertedHint =

        options?.convertedToClientId ?? options?.migratedClientId ?? null;



      const syncResolved = resolveEntityIdentity({

        entityType: type,

        entityId,

        id: entityId,

        converted_to_client_id: convertedHint,

        migrated_client_id: convertedHint,

      });



      if (syncResolved.entityType !== type || syncResolved.entityId !== entityId) {

        openEntityResolved(syncResolved.entityType, syncResolved.entityId, options);

        return;

      }



      if (type === "lead") {

        void (async () => {

          const clientId = await fetchLeadConvertedClientId(entityId);

          if (clientId) {

            openEntityResolved("client", clientId, options);

          } else {

            openEntityResolved("lead", entityId, options);

          }

        })();

        return;

      }



      openEntityResolved(type, entityId, options);

    },

    [openEntityResolved],

  );



  const openClient = useCallback(

    (clientId: string, options?: EntityNavigationOptions) => {

      openEntity("client", clientId, options);

    },

    [openEntity],

  );



  const openLead = useCallback(

    (leadId: string, options?: EntityNavigationOptions) => {

      openEntity("lead", leadId, options);

    },

    [openEntity],

  );



  return { openEntity, openClient, openLead, getClientUrl, getLeadUrl };

}


