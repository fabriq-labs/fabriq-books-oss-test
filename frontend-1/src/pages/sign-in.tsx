import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { appName, appTagline, copyright } from "@/config/brand";

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from "@/components/ui/card";
import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
});

const SignInPage = () => {
    const { login } = useAuth();
    const navigate = useNavigate();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(false);
    const [formError, setFormError] = useState("");

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    // Step 1: User Submits Form
    const onSubmit = async (values: z.infer<typeof formSchema>) => {
        setIsLoading(true);
        setFormError("");

        try {
            await login(values.email, values.password);
            toast({
                title: "Success!",
                description: "You have successfully logged in.",
            });
            // Navigation is handled in AuthContext after successful login
        } catch (err: any) {
            console.log(err);
            setFormError(err?.message || "Login failed");
            toast({
                title: "Login failed",
                description: err?.message || "An error occurred during login",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-8">
            <div className="w-full max-w-md flex flex-col items-center">
                {/* Logo section */}
                <div className="flex flex-col items-center mb-8">
                    <h1 className="text-4xl font-bold text-primary-600 mb-1">
                        {appName}
                    </h1>
                    <p className="text-sm text-gray-500 font-medium">
                        {appTagline}
                    </p>
                </div>

                {/* Sign-in form */}
                <Card className="w-full">
                    <CardHeader>
                        <CardTitle className="text-xl text-primary-600">
                            Welcome Back
                        </CardTitle>
                        <CardDescription>
                            Enter your credentials to login
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input placeholder="your.email@example.com" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    placeholder="Your password"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                {formError && (
                                    <p className="text-sm text-destructive text-center">{formError}</p>
                                )}
                                <Button type="submit" className="w-full" disabled={isLoading}>
                                    {isLoading ? (
                                        <>
                                            <Loader className="mr-2 h-4 w-4 animate-spin" />
                                            Logging in...
                                        </>
                                    ) : (
                                        "Login"
                                    )}
                                </Button>
                            </form>
                        </Form>
                    </CardContent>
                    <CardFooter className="flex flex-col">
                        <p className="text-sm text-center text-gray-500">
                            Copyright © {new Date().getFullYear()} {copyright}
                        </p>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default SignInPage;