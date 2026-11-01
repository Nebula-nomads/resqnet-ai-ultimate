import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Incident, IncidentPatch, updateIncident } from "../api";

/** PATCH /api/v1/incidents/{id}; writes the backend response straight into the cache, then revalidates. */
export const useUpdateIncident = () => {
  const qc = useQueryClient();
  return useMutation(
    ({ id, patch }: { id: number; patch: IncidentPatch }) => updateIncident(id, patch),
    {
      onSuccess: (updated) => {
        qc.setQueryData<Incident[]>(["incidents"], (old) =>
          old ? old.map((i) => (i.id === updated.id ? updated : i)) : old
        );
        qc.invalidateQueries(["incidents"]);
      },
    }
  );
};
