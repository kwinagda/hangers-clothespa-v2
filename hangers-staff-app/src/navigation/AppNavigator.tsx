import React from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer }        from '@react-navigation/native';
import { createNativeStackNavigator }  from '@react-navigation/native-stack';
import { useAuth }                    from '../hooks/useAuth';
import { Colors }                     from '../utils/theme';

import PinLoginScreen       from '../screens/PinLoginScreen';
import PlantDashboard       from '../screens/plant/PlantDashboard';
import PlantScanScreen      from '../screens/plant/PlantScanScreen';
import PlantOrdersList      from '../screens/plant/PlantOrdersList';
import PlantOrderDetail     from '../screens/plant/PlantOrderDetail';
import DeliveryDashboard    from '../screens/delivery/DeliveryDashboard';
import DeliveryOrderDetail  from '../screens/delivery/DeliveryOrderDetail';
import DeliverySummary      from '../screens/delivery/DeliverySummary';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { isAuthenticated, isLoading, appType } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>

        {/* Not logged in */}
        {!isAuthenticated && (
          <Stack.Screen name="PinLogin" component={PinLoginScreen} />
        )}

        {/* Plant App — Stack.Group used instead of <> which crashes React Navigation */}
        {isAuthenticated && appType === 'plant' && (
          <Stack.Group>
            <Stack.Screen name="PlantDashboard"  component={PlantDashboard}  />
            <Stack.Screen name="PlantScan"        component={PlantScanScreen} />
            <Stack.Screen name="PlantOrders"      component={PlantOrdersList} />
            <Stack.Screen name="PlantOrderDetail" component={PlantOrderDetail}/>
          </Stack.Group>
        )}

        {/* Delivery App */}
        {isAuthenticated && appType === 'delivery' && (
          <Stack.Group>
            <Stack.Screen name="DeliveryDashboard"   component={DeliveryDashboard}  />
            <Stack.Screen name="DeliveryOrderDetail" component={DeliveryOrderDetail} />
            <Stack.Screen name="DeliverySummary"     component={DeliverySummary}    />
          </Stack.Group>
        )}

      </Stack.Navigator>
    </NavigationContainer>
  );
}
