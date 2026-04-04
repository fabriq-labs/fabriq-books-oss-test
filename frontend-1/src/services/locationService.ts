
import { supabase } from "@/integrations/supabase/client";
import { LocationFormData, Location } from "@/models/Location";

export async function getLocations() {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data as Location[];
  } catch (error) {
    console.error("Error fetching locations:", error);
    return [];
  }
}

export async function getLocationById(id: string) {
  try {
    const { data, error } = await supabase
      .from('locations')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as Location;
  } catch (error) {
    console.error("Error fetching location:", error);
    return null;
  }
}

export async function createLocation(locationData: LocationFormData) {
  try {
    const { data, error } = await supabase
      .from('locations')
      .insert([{
        name: locationData.name,
        org_id: locationData.org_id,
        address: locationData.address,
        city: locationData.city,
        state: locationData.state,
        postal_code: locationData.postal_code,
        country: locationData.country,
        department_id: locationData.department_id
      }])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error creating location:", error);
    return { success: false, error };
  }
}

export async function updateLocation(id: string, locationData: LocationFormData) {
  try {
    const { data, error } = await supabase
      .from('locations')
      .update({
        name: locationData.name,
        org_id: locationData.org_id,
        address: locationData.address,
        city: locationData.city,
        state: locationData.state,
        postal_code: locationData.postal_code,
        country: locationData.country,
        department_id: locationData.department_id
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error) {
    console.error("Error updating location:", error);
    return { success: false, error };
  }
}

export async function deleteLocation(id: string) {
  try {
    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Error deleting location:", error);
    return { success: false, error };
  }
}
