import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';

const Announcements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'announcement',
    targetType: 'all_tenants',
    selectedFloors: [],
    selectedUnits: [],
    scheduledDate: '',
    isEmergency: false
  });
  const [buildings, setBuildings] = useState([]);
  const [selectedBuilding, setSelectedBuilding] = useState('');
  const [floors, setFloors] = useState([]);
  const [units, setUnits] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [notificationMethod, setNotificationMethod] = useState('email'); // 'email', 'sms', 'both'

  useEffect(() => {
    fetchAnnouncements();
    fetchBuildings();
  }, []);

  useEffect(() => {
    if (buildings.length > 0 && !selectedBuilding) {
      setSelectedBuilding(buildings[0]._id);
      fetchFloors(buildings[0]._id);
      fetchUnits(buildings[0]._id);
      fetchTenants(buildings[0]._id);
    }
  }, [buildings]);

  useEffect(() => {
    if (selectedBuilding) {
      fetchFloors(selectedBuilding);
      fetchUnits(selectedBuilding);
      fetchTenants(selectedBuilding);
    }
  }, [selectedBuilding]);

  const fetchAnnouncements = async () => {
    try {
      const response = await fetch('http://localhost:3000/announcements');
      const data = await response.json();
      setAnnouncements(data);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  const fetchBuildings = async () => {
    try {
      const response = await fetch('http://localhost:3000/buildings');
      const data = await response.json();
      setBuildings(data);
    } catch (error) {
      console.error('Error fetching buildings:', error);
    }
  };

  const fetchFloors = async (buildingId) => {
    try {
      const response = await fetch(`http://localhost:3000/floors?building=${buildingId}`);
      const data = await response.json();
      setFloors(data);
    } catch (error) {
      console.error('Error fetching floors:', error);
    }
  };

  const fetchUnits = async (buildingId) => {
    try {
      const response = await fetch(`http://localhost:3000/units?building=${buildingId}`);
      const data = await response.json();
      setUnits(data);
    } catch (error) {
      console.error('Error fetching units:', error);
    }
  };

  const fetchTenants = async (buildingId) => {
    try {
      const response = await fetch(`http://localhost:3000/tenants?building=${buildingId}`);
      const data = await response.json();
      setTenants(data);
    } catch (error) {
      console.error('Error fetching tenants:', error);
    }
  };

  const handleBuildingChange = (buildingId) => {
    setSelectedBuilding(buildingId);
    if (buildingId) {
      fetchFloors(buildingId);
      fetchUnits(buildingId);
      fetchTenants(buildingId);
    } else {
      setFloors([]);
      setUnits([]);
      setTenants([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    if (!selectedBuilding) {
      setError('Please select a building for this announcement.');
      setLoading(false);
      return;
    }

    try {
      // Prepare the data for submission
      const submissionData = {
        title: formData.title,
        message: formData.message,
        type: formData.type,
        targetType: formData.targetType,
        isEmergency: formData.isEmergency,
        scheduledDate: formData.scheduledDate || null,
        building: selectedBuilding || undefined,
        sendEmail: notificationMethod === 'email' || notificationMethod === 'both',
        sendSMS: notificationMethod === 'sms' || notificationMethod === 'both'
      };

      // Handle target IDs based on target type
      if (formData.targetType === 'selected_floors') {
        submissionData.targetIds = formData.selectedFloors;
        submissionData.targetModel = 'Floor';
      } else if (formData.targetType === 'selected_units') {
        submissionData.targetIds = formData.selectedUnits;
        submissionData.targetModel = 'Unit';
      }

      const response = await fetch('http://localhost:3000/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(submissionData),
      });

      const result = await response.json();
      if (response.ok) {
        setShowForm(false);
        setMessage('Announcement created successfully.');
        setError('');
        setFormData({
          title: '',
          message: '',
          type: 'announcement',
          targetType: 'all_tenants',
          selectedFloors: [],
          selectedUnits: [],
          scheduledDate: '',
          isEmergency: false
        });
        setSelectedBuilding('');
        setFloors([]);
        setUnits([]);
        setNotificationMethod('email');
        fetchAnnouncements();
      } else {
        setError(result.error || 'Error creating announcement');
        setMessage('');
        console.error('Error creating announcement:', result);
      }
    } catch (error) {
      setError(error.message || 'Error creating announcement');
      setMessage('');
      console.error('Error creating announcement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async (id) => {
    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`http://localhost:3000/announcements/${id}/send`, {
        method: 'POST',
      });
      const result = await response.json();

      if (response.ok) {
        let successMessage = result.message || 'Announcement sent successfully.';
        if (result.errors?.email?.length > 0 || result.errors?.sms?.length > 0) {
          const emailProblem = result.errors?.email?.length > 0 ? `${result.errors.email.length} email failures` : '';
          const smsProblem = result.errors?.sms?.length > 0 ? `${result.errors.sms.length} SMS failures` : '';
          const problems = [emailProblem, smsProblem].filter(Boolean).join(' and ');
          successMessage += ` (${problems})`;
        }
        setMessage(successMessage);
        setError('');
        fetchAnnouncements();
      } else {
        const detail = result.errors?.email?.length > 0
          ? result.errors.email.map(err => `${err.email || err.tenant}: ${err.error}`).join('; ')
          : result.error;
        setError(detail || 'Error sending announcement');
        setMessage('');
        console.error('Error sending announcement:', result);
      }
    } catch (error) {
      setError(error.message || 'Error sending announcement');
      setMessage('');
      console.error('Error sending announcement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this announcement?')) {
      return;
    }

    setLoading(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`http://localhost:3000/announcements/${id}`, {
        method: 'DELETE',
      });
      const result = await response.json();

      if (response.ok) {
        setMessage('Announcement deleted successfully.');
        setError('');
        fetchAnnouncements();
      } else {
        setError(result.error || 'Error deleting announcement');
        setMessage('');
        console.error('Error deleting announcement:', result);
      }
    } catch (error) {
      setError(error.message || 'Error deleting announcement');
      setMessage('');
      console.error('Error deleting announcement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleArrayChange = (name, value, checked) => {
    setFormData(prev => ({
      ...prev,
      [name]: checked
        ? [...prev[name], value]
        : prev[name].filter(item => item !== value)
    }));
  };

  const getTypeLabel = (type) => {
    const labels = {
      announcement: 'Announcement',
      emergency: 'Emergency Alert',
      rent_reminder: 'Rent Reminder'
    };
    return labels[type] || type;
  };

  const getTargetLabel = (targetType) => {
    const labels = {
      all_tenants: 'All Tenants',
      selected_floors: 'Selected Floors',
      selected_units: 'Selected Units',
      specific_tenants: 'Specific Tenants'
    };
    return labels[targetType] || targetType;
  };

  const getStatusBadge = (status) => {
    const styles = {
      sent: 'bg-green-100 text-green-800',
      scheduled: 'bg-yellow-100 text-yellow-800',
      sending: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      draft: 'bg-gray-100 text-gray-800'
    };
    return (
      <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status] || styles.draft}`}>
        {status}
      </span>
    );
  };

  const renderDeliveryStatus = (announcement) => {
    if (!announcement.deliveryStatus) return null;
    
    const { sms, email } = announcement.deliveryStatus;
    const hasData = (sms && sms.total > 0) || (email && email.total > 0);
    
    if (!hasData) return null;

    return (
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-sm font-medium text-gray-700 mb-2">Delivery Status:</p>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {email && email.total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Email:</span>
              <span className="text-green-600 font-medium">{email.sent} sent</span>
              {email.failed > 0 && <span className="text-red-500">({email.failed} failed)</span>}
            </div>
          )}
          {sms && sms.total > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">SMS:</span>
              <span className="text-green-600 font-medium">{sms.sent} sent</span>
              {sms.failed > 0 && <span className="text-red-500">({sms.failed} failed)</span>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNotificationMethod = (announcement) => {
    const methods = [];
    if (announcement.sendEmail) methods.push('Email');
    if (announcement.sendSMS) methods.push('SMS');
    return methods.length > 0 ? methods.join(' + ') : 'None';
  };

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Announcements & Communications</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
          >
            {showForm ? 'Cancel' : '+ Create Announcement'}
          </button>
        </div>

        {message && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
            {message}
          </div>
        )}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {showForm && (
          <div className="panel bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800">Create New Announcement</h2>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                  <input
                    type="text"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter announcement title"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="announcement">Announcement</option>
                    <option value="emergency">Emergency Alert</option>
                    <option value="rent_reminder">Rent Reminder</option>
                  </select>
                </div>
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Message *</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  rows={5}
                  style={{ width: '100%' }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                  placeholder="Enter your message here..."
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Audience *</label>
                  <select
                    name="targetType"
                    value={formData.targetType}
                    onChange={handleInputChange}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="all_tenants">All Tenants</option>
                    <option value="selected_floors">Selected Floors</option>
                    <option value="selected_units">Selected Units</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notification Method *</label>
                  <select
                    value={notificationMethod}
                    onChange={(e) => setNotificationMethod(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="email">Email Only</option>
                    <option value="sms">SMS Only</option>
                    <option value="both">Both Email & SMS</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Messages will be sent to the email/phone in tenant records
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Building *</label>
                <select
                  value={selectedBuilding}
                  onChange={(e) => handleBuildingChange(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Choose Building</option>
                  {buildings.map(building => (
                    <option key={building._id} value={building._id}>
                      {building.name}
                    </option>
                  ))}
                </select>
              </div>

              {formData.targetType === 'selected_floors' && selectedBuilding && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Select Floors</label>
                  {floors.length === 0 ? (
                    <p className="text-gray-500 text-sm">No floors available for this building</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {floors.map((floor) => {
                        const isSelected = formData.selectedFloors.includes(floor._id);
                        return (
                          <div
                            key={floor._id}
                            className={`flex items-start p-3 rounded-lg cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-100 border-2 border-blue-500'
                                : 'bg-white border border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              handleArrayChange('selectedFloors', floor._id, !isSelected);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="h-5 w-5 text-blue-600 rounded mt-0.5 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0 ml-3">
                              <span className="text-sm font-semibold text-gray-800">Floor {floor.floor}</span>
                              <span className="text-xs text-gray-500 block mt-1">{floor.units} units</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {formData.selectedFloors.length > 0 && (
                    <p className="text-sm text-blue-600 mt-3 font-medium">
                      ✓ {formData.selectedFloors.length} floor(s) selected
                    </p>
                  )}
                </div>
              )}

              {formData.targetType === 'selected_units' && selectedBuilding && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 mb-3">Select Units</label>
                  {units.length === 0 ? (
                    <p className="text-gray-500 text-sm">No units available for this building</p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {units.map((unit) => {
                        const tenant = tenants.find(t => t.unit === unit._id || t.unit?._id === unit._id);
                        const isSelected = formData.selectedUnits.includes(unit._id);
                        return (
                          <div
                            key={unit._id}
                            className={`flex items-start p-3 rounded-lg cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-100 border-2 border-blue-500'
                                : 'bg-white border border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                            }`}
                            onClick={() => {
                              handleArrayChange('selectedUnits', unit._id, !isSelected);
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="h-5 w-5 text-blue-600 rounded mt-0.5 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0 ml-3">
                              <span className="text-sm font-semibold text-gray-800">Unit {unit.unitId || unit._id}</span>
                              {tenant ? (
                                <p className="text-sm text-gray-600 mt-1">
                                  <span className="text-gray-500">Tenant:</span> {tenant.tenantName}
                                </p>
                              ) : (
                                <p className="text-sm text-gray-400 mt-1 italic">No tenant assigned</p>
                              )}
                              <span className="text-xs text-gray-500 block mt-1">{unit.area || 'N/A'} sqm</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {formData.selectedUnits.length > 0 && (
                    <p className="text-sm text-blue-600 mt-3 font-medium">
                      ✓ {formData.selectedUnits.length} unit(s) selected
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date (Optional)</label>
                <input
                  type="datetime-local"
                  name="scheduledDate"
                  value={formData.scheduledDate}
                  onChange={handleInputChange}
                  className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-500 text-white py-3 px-4 rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                {loading ? 'Creating Announcement...' : 'Create Announcement'}
              </button>
            </form>
          </div>
        )}

        <div className="panel bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-800">Recent Announcements</h2>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {announcements.length} total
            </span>
          </div>
          {announcements.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="text-base mb-2">No announcements yet</p>
              <p className="text-sm">Create your first announcement to get started with tenant communications.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {announcements.map((announcement, index) => (
                <div 
                  key={announcement._id} 
                  className={`rounded-lg p-4 transition-all duration-200 ${
                    announcement.type === 'emergency' 
                      ? 'border-l-4 border-l-red-500 bg-red-50 border border-gray-200' 
                      : 'border border-gray-200 hover:shadow-md hover:border-blue-300'
                  }`}
                >
                  {/* Header Row */}
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm text-gray-800">{announcement.title}</h3>
                        {announcement.type === 'emergency' && (
                          <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded animate-pulse">
                            🚨 EMERGENCY
                          </span>
                        )}
                        {getStatusBadge(announcement.status)}
                      </div>
                    </div>
                  </div>
                  
                  {/* Meta Info Row */}
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      {getTypeLabel(announcement.type)}
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                      {getTargetLabel(announcement.targetType)}
                    </span>
                    {announcement.building?.name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                        Building: {announcement.building.name}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      announcement.sendEmail && announcement.sendSMS 
                        ? 'bg-green-100 text-green-800' 
                        : announcement.sendEmail 
                        ? 'bg-cyan-100 text-cyan-800'
                        : announcement.sendSMS
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {renderNotificationMethod(announcement)}
                    </span>
                  </div>
                  
                  {/* Message Preview */}
                  <p className="text-gray-600 text-sm mb-2 line-clamp-2 bg-white/50 p-2 rounded">
                    {announcement.message}
                  </p>
                  
                  {/* Timestamps */}
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 mb-2">
                    <span className="text-xs text-gray-500">
                      Created: {new Date(announcement.createdAt).toLocaleDateString('en-US', { 
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                    {announcement.sentAt && (
                      <span className="text-xs text-green-600">
                        Sent: {new Date(announcement.sentAt).toLocaleDateString('en-US', { 
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    )}
                  </div>

                  {/* Delivery Status */}
                  {renderDeliveryStatus(announcement)}

                  {/* Action Buttons */}
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-200">
                    {announcement.status === 'draft' && (
                      <button
                        onClick={() => handleSend(announcement._id)}
                        className="bg-blue-500 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-600 transition-colors disabled:opacity-50"
                        disabled={loading}
                      >
                        Send Now
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(announcement._id)}
                      className="bg-red-50 text-red-600 px-3 py-1.5 rounded text-sm hover:bg-red-100 transition-colors disabled:opacity-50 border border-red-200"
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Announcements;