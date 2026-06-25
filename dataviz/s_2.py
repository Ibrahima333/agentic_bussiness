import pandas as pd
import plotly.express as px

def main():
    df = pd.read_csv("outputs/s_2/s_2.csv")
    
    # Since the business question is not specified, we will create a simple interactive table
    fig = px.scatter(df, x="Identifiant", y="DateInscription")
    
    # Update layout to make it more readable
    fig.update_layout(
        title="User Data",
        xaxis_title="Identifiant",
        yaxis_title="DateInscription"
    )
    
    # Save the figure to an HTML file
    fig.write_html("outputs/s_2/s_2.html")

if __name__ == "__main__":
    main()