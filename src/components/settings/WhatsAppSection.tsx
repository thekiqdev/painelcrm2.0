
import React from "react";
import AddConnectionDialog from "@/components/whatsapp/AddConnectionDialog";
import ConnectionPanel from "@/components/whatsapp/ConnectionPanel";
import StatusPanel from "@/components/whatsapp/StatusPanel";
import AdvancedSettings from "@/components/whatsapp/AdvancedSettings";
import useWhatsAppConnection from "@/components/whatsapp/useWhatsAppConnection";

export const WhatsAppSection = () => {
  const {
    connections,
    activeConnection,
    connectionStatus,
    qrCode,
    isLoading,
    isDialogOpen,
    setIsDialogOpen,
    handleAddConnection,
    handleConnect,
    handleDisconnect,
    handleConfirmConnection
  } = useWhatsAppConnection();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ConnectionPanel
          connections={connections}
          activeConnection={activeConnection}
          qrCode={qrCode}
          connectionStatus={connectionStatus}
          isLoading={isLoading}
          onAddConnectionClick={() => setIsDialogOpen(true)}
          handleConnect={handleConnect}
          handleDisconnect={handleDisconnect}
          handleConfirmConnection={handleConfirmConnection}
        />
        
        <StatusPanel 
          connectionStatus={connectionStatus} 
          activeConnection={activeConnection} 
        />
      </div>
      
      {connectionStatus === "connected" && <AdvancedSettings />}
      
      <AddConnectionDialog
        isOpen={isDialogOpen}
        onClose={() => setIsDialogOpen(false)}
        onAddConnection={handleAddConnection}
      />
    </div>
  );
};

export default WhatsAppSection;
