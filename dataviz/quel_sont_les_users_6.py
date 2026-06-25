import pandas as pd
import plotly.express as px

def main():
    df = pd.read_csv("outputs/quel_sont_les_users_6/quel_sont_les_users_6.csv")
    
    # Since the data is about users and their information, a table or a simple card might be more suitable for displaying this information.
    # However, given the constraints and the need for a chart, a clustered column chart could be used to show the count of users with the same name or other categories.
    # But since the question is "quel sont les users" which translates to "what are the users", a simple table or a card with user information might be more appropriate.
    # For the sake of following the instructions and using a chart, let's use a clustered column chart to show the count of users with the same name.
    
    # Count the number of users with the same name
    user_counts = df['nom_utilisateur'].value_counts().reset_index()
    user_counts.columns = ['nom_utilisateur', 'count']
    
    # Create a clustered column chart
    fig = px.bar(user_counts, x='nom_utilisateur', y='count', title='Count of Users by Name')
    
    # Save the figure to an HTML file
    fig.write_html("outputs/quel_sont_les_users_6/quel_sont_les_users_6.html")

if __name__ == "__main__":
    main()