
import React from "react";
import { FunnelHeader } from "@/components/funnel/FunnelHeader";
import { FunnelTabs } from "@/components/funnel/FunnelTabs";
import { NewFunnelDialog } from "@/components/funnel/NewFunnelDialog";
import { useFunnelData } from "@/hooks/useFunnelData";

const Funnel = () => {
  const {
    activeTab,
    setActiveTab,
    funnels,
    deals,
    activeFunnelId,
    setActiveFunnelId,
    dialogOpen,
    setDialogOpen,
    isLoading,
    newFunnelName,
    setNewFunnelName,
    newFunnelDesc,
    setNewFunnelDesc,
    newFunnelType,
    setNewFunnelType,
    newFunnelSource,
    setNewFunnelSource,
    isSubmitting,
    handleViewFunnelDetails,
    handleCreateFunnel
  } = useFunnelData();

  return (
    <div className="space-y-6">
      <FunnelHeader onOpenNewFunnelDialog={() => setDialogOpen(true)} />

      <FunnelTabs
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        funnels={funnels}
        activeFunnelId={activeFunnelId}
        setActiveFunnelId={setActiveFunnelId}
        handleViewFunnelDetails={handleViewFunnelDetails}
        filteredDeals={deals}
        isLoading={isLoading}
      />

      <NewFunnelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreateFunnel}
        isSubmitting={isSubmitting}
        newFunnelName={newFunnelName}
        setNewFunnelName={setNewFunnelName}
        newFunnelDesc={newFunnelDesc}
        setNewFunnelDesc={setNewFunnelDesc}
        newFunnelType={newFunnelType}
        setNewFunnelType={setNewFunnelType}
        newFunnelSource={newFunnelSource}
        setNewFunnelSource={setNewFunnelSource}
      />
    </div>
  );
};

export default Funnel;
