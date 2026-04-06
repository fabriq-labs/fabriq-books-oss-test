import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { format } from 'date-fns';

import moment from 'moment';
import { reportAPI, workflowAPI } from '@/api/api';

export const FeedCard = () => {
  const [myFeed, setMyFeed] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    getMyFeed();
  }, []);

  const getMyFeed = async () => {
    setIsLoading(true);
    await reportAPI.getReport("my_feed")
      .then((res: any) => {
        const formattedData = res?.data?.map((item: any) => ({
          pr_number: item.pr_number,
          source_state: item.source_state_name,
          target_state: item.target_state_name,
          action_name: item.action_name,
          name: item.modified_by_name,
          email: item.modified_by_email,
          modified_at: item.modified_at,
        })) || [];

        setMyFeed(formattedData);
        setIsLoading(false);
      }).catch((error) => {
        console.error("Error fetching my feed:", error);
        setMyFeed([]);
        setIsLoading(false);
      });
  };

  const getActionSuffix = (action: string) => {
    switch (action?.toLowerCase()) {
      case "submit":
        return "submitted";
      case "approve":
        return "approved";
      case "deliver":
        return "delivered";
      case "reject":
        return "rejected";
      case "query":
        return "queried";
      default:
        return action + "d";
    }
  };

  return (
    <Card className="h-full shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium">Activity Feed</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-center py-4 text-gray-500">
              Loading activities...
            </div>
          ) : myFeed.length > 0 ? (
            myFeed.slice(0, 4).map((feed: any, index: number) => (
              <div key={index} className="border-b pb-3 last:border-0 last:pb-0">
                <h4 className="text-sm font-semibold text-gray-800">
                  Purchase Request {getActionSuffix(feed.action_name)}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  You {getActionSuffix(feed.action_name)} Purchase Request{" "}
                  {feed.pr_number} on{" "}
                  {moment(feed.modified_at).format("DD-MM-YYYY")} at{" "}
                  {moment(feed.modified_at).format("hh:mm A")}
                </p>
                <span className="text-xs text-gray-500 mt-1 block">
                  {format(new Date(feed.modified_at), 'MMM d, yyyy • h:mm a')}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-gray-500">
              No recent activity
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};